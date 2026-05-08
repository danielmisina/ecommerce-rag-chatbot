import { Pool } from "pg";
import { GelCalculationInput, GelCalculationResult, RaceLeg, RaceType } from "../types";

// ---------------------------------------------------------------------------
// Race presets — typical age-grouper times per leg (minutes), excluding swim.
// Swim is excluded because gels cannot be taken in the water.
// ---------------------------------------------------------------------------
const RACE_PRESETS: Record<RaceType, Record<RaceLeg, number>> = {
  sprint:  { bike: 40,  run: 18,  all: 55  },
  olympic: { bike: 75,  run: 50,  all: 120 },
  "70.3":  { bike: 165, run: 110, all: 270 },
  ironman: { bike: 360, run: 300, all: 660 },
};

// ---------------------------------------------------------------------------
// Gel product lookup — fetches a single product by id from the DB.
// Falls back to the highest-rated in-stock gel if no id is given.
// ---------------------------------------------------------------------------
type GelRow = {
  id: string;
  title: string;
  brand: string;
  price: string;
  url: string | null;
  carbs_per_serving: number;
};

const fetchGel = async (pool: Pool, gelId?: string): Promise<GelRow> => {
  if (gelId) {
    const result = await pool.query<GelRow>(
      `SELECT id, title, brand, price, url, carbs_per_serving
       FROM products
       WHERE id = $1 AND carbs_per_serving IS NOT NULL AND carbs_per_serving > 0`,
      [gelId]
    );
    if (!result.rows.length) {
      throw new Error(`Product "${gelId}" not found or has no carbs_per_serving value.`);
    }
    return result.rows[0];
  }

  // Auto-select: highest-rated in-stock gel with carb data
  const result = await pool.query<GelRow>(
    `SELECT id, title, brand, price, url, carbs_per_serving
     FROM products
     WHERE category = 'nutrition'
       AND carbs_per_serving IS NOT NULL
       AND carbs_per_serving > 0
       AND in_stock = true
     ORDER BY rating DESC
     LIMIT 1`
  );
  if (!result.rows.length) {
    throw new Error("No nutrition products with carb data found in the catalog.");
  }
  return result.rows[0];
};

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------
export const calculateGels = async (
  input: GelCalculationInput,
  pool: Pool
): Promise<GelCalculationResult> => {
  // Resolve duration
  let durationMinutes: number;
  if (input.durationMinutes != null && input.durationMinutes > 0) {
    durationMinutes = input.durationMinutes;
  } else if (input.raceType) {
    durationMinutes = RACE_PRESETS[input.raceType][input.leg];
  } else {
    throw new Error('Provide either "raceType" or "durationMinutes".');
  }

  const gel = await fetchGel(pool, input.gelId);
  const durationHours   = durationMinutes / 60;
  const totalCarbsNeeded = Math.round(input.carbsPerHour * durationHours);
  const gelsNeeded      = Math.ceil(totalCarbsNeeded / gel.carbs_per_serving);

  // Build contextual notes
  const notes: string[] = [];

  if (input.raceType === "sprint" && input.leg === "all") {
    notes.push(
      "Sprint triathlons are typically under 1 hour. " +
      "Many athletes complete them without gels — consider just water and electrolytes."
    );
  }
  if (durationMinutes < 45) {
    notes.push("Fuelling with gels is generally not needed for efforts under 45 minutes.");
  }
  if (input.carbsPerHour > 60) {
    notes.push(
      "Carbohydrate intake above 60 g/hr requires gut training. " +
      "Build up gradually in training before racing at this rate."
    );
  }
  if (input.carbsPerHour >= 80 && gel.carbs_per_serving < 40) {
    notes.push(
      `At ${input.carbsPerHour} g/hr you would need to take a gel roughly every ` +
      `${Math.round((gel.carbs_per_serving / input.carbsPerHour) * 60)} minutes. ` +
      "Consider a higher-carb gel or a drink mix to reduce the number of intakes."
    );
  }
  if (input.leg === "run" && (input.raceType === "ironman" || input.raceType === "70.3")) {
    notes.push(
      "On the run leg many athletes switch from gels to cola or broth available at aid stations " +
      "to reduce GI stress late in a long-course race."
    );
  }

  return {
    raceType: input.raceType,
    leg: input.leg,
    durationMinutes,
    carbsPerHour: input.carbsPerHour,
    totalCarbsNeeded,
    gelsNeeded,
    product: {
      id:              gel.id,
      title:           gel.title,
      brand:           gel.brand,
      price:           Number(gel.price),
      url:             gel.url ?? undefined,
      carbsPerServing: gel.carbs_per_serving,
    },
    notes,
  };
};

