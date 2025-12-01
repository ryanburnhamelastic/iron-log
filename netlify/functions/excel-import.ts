import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import * as XLSX from 'xlsx';

interface ParsedExercise {
  name: string;
  warmupSets: number;
  workingSets: number;
  repRangeMin: number;
  repRangeMax: number;
  rir: number | null;
  restSeconds: number;
  notes: string | null;
  substitutions: string[];
  category: string | null;
}

interface ParsedWorkout {
  name: string;
  dayNumber: number;
  exercises: ParsedExercise[];
}

interface ParsedWeek {
  weekNumber: number;
  name: string;
  weekType: 'intro' | 'normal' | 'deload';
  workouts: ParsedWorkout[];
}

interface ParsedBlock {
  blockNumber: number;
  name: string;
  weeks: ParsedWeek[];
}

interface ParsedProgram {
  name: string;
  frequencyPerWeek: number;
  source: string;
  blocks: ParsedBlock[];
}

// Category mappings based on exercise names
const CATEGORY_MAPPINGS: Record<string, string> = {
  squat: 'Quads',
  'leg press': 'Quads',
  'leg extension': 'Quads',
  lunge: 'Quads',
  'leg curl': 'Hamstrings',
  rdl: 'Hamstrings',
  deadlift: 'Hamstrings',
  'hip thrust': 'Glutes',
  'glute': 'Glutes',
  'calf': 'Calves',
  bench: 'Chest',
  'chest press': 'Chest',
  'incline': 'Chest',
  fly: 'Chest',
  'pec deck': 'Chest',
  'lat pulldown': 'Back',
  'pull-up': 'Back',
  row: 'Back',
  pullover: 'Back',
  shrug: 'Back',
  'lateral raise': 'Shoulders',
  'shoulder press': 'Shoulders',
  'rear delt': 'Shoulders',
  'y-raise': 'Shoulders',
  curl: 'Biceps',
  'triceps': 'Triceps',
  'tricep': 'Triceps',
  kickback: 'Triceps',
  crunch: 'Abs',
  'ab ': 'Abs',
  wrist: 'Forearms',
  'dead hang': 'Grip',
};

function categorizeExercise(name: string): string | null {
  const lowerName = name.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_MAPPINGS)) {
    if (lowerName.includes(keyword)) {
      return category;
    }
  }
  return null;
}

// Excel date serial number to rep range mapping (common patterns in Min-Max)
const EXCEL_DATE_TO_REP_RANGE: Record<number, [number, number]> = {
  45816: [6, 8],
  45879: [10, 12],
  45847: [8, 10],
  45785: [4, 6],
  45910: [12, 15],
};

function parseRepRange(value: string | number | undefined): [number, number] {
  if (!value) return [8, 12];

  // If it's a number, it might be an Excel date serial
  if (typeof value === 'number') {
    if (EXCEL_DATE_TO_REP_RANGE[value]) {
      return EXCEL_DATE_TO_REP_RANGE[value];
    }
    // Try to interpret as a single rep count
    if (value >= 1 && value <= 30) {
      return [value, value];
    }
    return [8, 12]; // Default
  }

  const str = String(value);
  // Try to match "X-Y" pattern
  const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])];
  }

  // Try single number
  const singleMatch = str.match(/^(\d+)$/);
  if (singleMatch) {
    const num = parseInt(singleMatch[1]);
    return [num, num];
  }

  return [8, 12]; // Default
}

function parseWarmupSets(value: string | number | undefined): number {
  if (!value) return 0;

  const str = String(value);
  // Match patterns like "1-2", "0-1", "2-3"
  const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return parseInt(rangeMatch[1]); // Use the lower bound
  }

  // Single number
  const num = parseInt(str);
  if (!isNaN(num) && num >= 0 && num <= 5) {
    return num;
  }

  return 0;
}

function parseMinMaxProgram(workbook: XLSX.WorkBook): ParsedProgram {
  const program: ParsedProgram = {
    name: 'Min-Max Program',
    frequencyPerWeek: 4,
    source: 'Jeff Nippard',
    blocks: [],
  };

  // Process the main sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][];

  // Update frequency from sheet name
  const freqMatch = sheetName.match(/(\d+)x/);
  if (freqMatch) {
    program.frequencyPerWeek = parseInt(freqMatch[1]);
  }

  let currentBlock: ParsedBlock | null = null;
  let currentWeek: ParsedWeek | null = null;
  let currentWorkout: ParsedWorkout | null = null;
  let exerciseOrder = 0;

  // In the Min-Max Excel:
  // Column B (index 1): Block names, Week names, Workout names
  // Column C (index 2): Exercise names (same row as workout, or standalone)
  // Column D (index 3): Last-Set Intensity Technique
  // Column E (index 4): Warm-up Sets
  // Column F (index 5): Working Sets
  // Column G (index 6): Rep Range
  // Column L (index 11): RIR Set 1
  // Column N (index 13): Rest
  // Column O (index 14): Substitution 1
  // Column P (index 15): Substitution 2
  // Column Q (index 16): Notes

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const colB = String(row[1] || '').trim(); // Block/Week/Workout names
    const colC = String(row[2] || '').trim(); // Exercise names or headers
    const lowerB = colB.toLowerCase();
    const lowerC = colC.toLowerCase();

    // Skip program notes and copyright rows
    if (
      lowerB.includes('important program notes') ||
      lowerB.includes('the min-max program') ||
      lowerB.includes('copyright') ||
      lowerB.includes('warm-up protocol')
    ) {
      continue;
    }

    // Skip header rows
    if (lowerC === 'exercise' || lowerC.includes('tracking load') || lowerC === 'load') {
      continue;
    }

    // Detect Block headers (in column B)
    if (lowerB.includes('block') && !lowerB.includes('exercise')) {
      const blockNum = parseInt(colB.match(/\d+/)?.[0] || String(program.blocks.length + 1));
      currentBlock = {
        blockNumber: blockNum,
        name: colB,
        weeks: [],
      };
      program.blocks.push(currentBlock);
      currentWeek = null;
      currentWorkout = null;
      continue;
    }

    // Detect Week headers (in column B)
    // Format: "Week 1" with "Exercise" in column C indicates start of actual week content
    // "Intro Week" or "Deload Week" alone (without "Exercise" in C) are just labels for the next week
    // Skip notes that happen to contain "week"
    if (lowerB.includes('week') && !lowerB.includes('per week') && !lowerB.includes('program notes') && colB.length < 50) {
      if (!currentBlock) {
        currentBlock = { blockNumber: 1, name: 'Block 1', weeks: [] };
        program.blocks.push(currentBlock);
      }

      // If "Exercise" is in column C, this is the actual week header row
      // Otherwise it's just a descriptive label (like "Intro Week" before "Week 1")
      if (lowerC === 'exercise') {
        const weekNum = parseInt(colB.match(/\d+/)?.[0] || String(currentBlock.weeks.length + 1));

        // Check if previous row was a label like "Intro Week" or "Deload Week"
        let weekType: 'intro' | 'normal' | 'deload' = 'normal';
        let weekName = colB; // e.g., "Week 1"
        if (i > 0 && data[i - 1]) {
          const prevB = String(data[i - 1][1] || '').toLowerCase();
          if (prevB.includes('intro')) {
            weekType = 'intro';
            weekName = colB + ' (Intro)'; // e.g., "Week 1 (Intro)"
          } else if (prevB.includes('deload')) {
            weekType = 'deload';
            weekName = colB + ' (Deload)'; // e.g., "Week 7 (Deload)"
          }
        }

        currentWeek = {
          weekNumber: weekNum,
          name: weekName,
          weekType,
          workouts: [],
        };
        currentBlock.weeks.push(currentWeek);
        currentWorkout = null;
      }
      // If no "Exercise" in column C, this is just a label - skip it
      continue;
    }

    // Detect rest day markers
    if (lowerB.includes('rest day')) {
      continue;
    }

    // Detect workout day headers (Full Body, Upper, Lower, Arms/Delts) - in column B
    const workoutNames = ['full body', 'upper', 'lower', 'arms', 'arms/delts', 'push', 'pull', 'legs'];
    if (workoutNames.some((w) => lowerB === w || lowerB.startsWith(w))) {
      if (!currentWeek) {
        if (!currentBlock) {
          currentBlock = { blockNumber: 1, name: 'Block 1', weeks: [] };
          program.blocks.push(currentBlock);
        }
        currentWeek = {
          weekNumber: 1,
          name: 'Week 1',
          weekType: 'normal',
          workouts: [],
        };
        currentBlock.weeks.push(currentWeek);
      }

      currentWorkout = {
        name: colB,
        dayNumber: currentWeek.workouts.length + 1,
        exercises: [],
      };
      currentWeek.workouts.push(currentWorkout);
      exerciseOrder = 0;

      // The first exercise is in column C on the same row
      if (colC && !lowerC.includes('exercise')) {
        addExerciseToWorkout(currentWorkout, colC, row, exerciseOrder++);
      }
      continue;
    }

    // Parse exercise rows - exercise name in column C when column B is empty
    if (colC && !colB && currentWorkout && !lowerC.includes('exercise') && !lowerC.includes('load')) {
      addExerciseToWorkout(currentWorkout, colC, row, exerciseOrder++);
    }
  }

  return program;
}

function addExerciseToWorkout(
  workout: ParsedWorkout,
  exerciseName: string,
  row: (string | number)[],
  order: number
): void {
  const [repMin, repMax] = parseRepRange(row[6]);
  const warmupSets = parseWarmupSets(row[4]);

  let workingSets = 2;
  if (row[5]) {
    const setsVal = parseInt(String(row[5]));
    if (!isNaN(setsVal) && setsVal > 0 && setsVal < 10) {
      workingSets = setsVal;
    }
  }

  let rir: number | null = null;
  const rirCol = row[11];
  if (typeof rirCol === 'number' && rirCol >= 0 && rirCol <= 4) {
    rir = rirCol;
  }

  let restSeconds = 120;
  const restCell = String(row[13] || '');
  const restMatch = restCell.match(/(\d+)\s*[-–]?\s*(\d*)\s*min/);
  if (restMatch) {
    restSeconds = parseInt(restMatch[1]) * 60;
  }

  const substitutions: string[] = [];
  if (row[14] && String(row[14]).trim() && !String(row[14]).toLowerCase().includes('see notes')) {
    substitutions.push(String(row[14]).trim());
  }
  if (row[15] && String(row[15]).trim() && !String(row[15]).toLowerCase().includes('see notes')) {
    substitutions.push(String(row[15]).trim());
  }

  workout.exercises.push({
    name: exerciseName,
    warmupSets,
    workingSets,
    repRangeMin: repMin,
    repRangeMax: repMax,
    rir,
    restSeconds,
    notes: row[16] ? String(row[16]).trim() : null,
    substitutions,
    category: categorizeExercise(exerciseName),
  });
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    await initDb();
    const sql = getDb();

    // Verify Clerk JWT and get user ID
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    // Get user ID from database
    let userId = null;
    const user = await sql`
      SELECT id FROM users WHERE clerk_user_id = ${authResult.clerkUserId}
    `;
    if (user.length > 0) {
      userId = user[0].id;
    }

    // Parse the multipart form data
    const contentType = event.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Expected multipart/form-data' }),
      };
    }

    // Extract boundary
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Could not find boundary in content-type' }),
      };
    }

    const boundary = boundaryMatch[1];
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '');

    // Simple multipart parsing to get file content
    const parts = body.toString('binary').split(`--${boundary}`);
    let fileBuffer: Buffer | null = null;

    for (const part of parts) {
      if (part.includes('filename=')) {
        // Find the start of file content (after headers)
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const content = part.slice(headerEnd + 4);
          // Remove trailing \r\n-- if present
          const cleanContent = content.replace(/\r\n--$/, '');
          fileBuffer = Buffer.from(cleanContent, 'binary');
        }
      }
    }

    if (!fileBuffer) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file found in request' }),
      };
    }

    // Parse Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const parsedProgram = parseMinMaxProgram(workbook);

    // Create program in database
    const [program] = await sql`
      INSERT INTO programs (name, description, frequency_per_week, source, created_by)
      VALUES (
        ${parsedProgram.name},
        ${'Imported from Excel'},
        ${parsedProgram.frequencyPerWeek},
        ${parsedProgram.source},
        ${userId}
      )
      RETURNING *
    `;

    // Create blocks, weeks, workouts, and exercises
    for (const parsedBlock of parsedProgram.blocks) {
      const [block] = await sql`
        INSERT INTO program_blocks (program_id, block_number, name, sort_order)
        VALUES (${program.id}, ${parsedBlock.blockNumber}, ${parsedBlock.name}, ${parsedBlock.blockNumber})
        RETURNING *
      `;

      for (const parsedWeek of parsedBlock.weeks) {
        const [week] = await sql`
          INSERT INTO block_weeks (block_id, week_number, name, week_type, sort_order)
          VALUES (${block.id}, ${parsedWeek.weekNumber}, ${parsedWeek.name}, ${parsedWeek.weekType}, ${parsedWeek.weekNumber})
          RETURNING *
        `;

        for (const parsedWorkout of parsedWeek.workouts) {
          const [workout] = await sql`
            INSERT INTO workout_templates (week_id, name, day_number, sort_order)
            VALUES (${week.id}, ${parsedWorkout.name}, ${parsedWorkout.dayNumber}, ${parsedWorkout.dayNumber})
            RETURNING *
          `;

          for (let i = 0; i < parsedWorkout.exercises.length; i++) {
            const parsedExercise = parsedWorkout.exercises[i];

            // Find or create exercise in library
            let exerciseResult = await sql`
              SELECT * FROM exercises WHERE LOWER(name) = LOWER(${parsedExercise.name})
            `;

            if (exerciseResult.length === 0) {
              exerciseResult = await sql`
                INSERT INTO exercises (name, category)
                VALUES (${parsedExercise.name}, ${parsedExercise.category})
                RETURNING *
              `;
            }

            const exercise = exerciseResult[0];

            // Create template exercise
            await sql`
              INSERT INTO template_exercises (
                workout_template_id, exercise_id, exercise_order,
                warmup_sets, working_sets, rep_range_min, rep_range_max,
                rir, rest_seconds, notes
              )
              VALUES (
                ${workout.id}, ${exercise.id}, ${i + 1},
                ${parsedExercise.warmupSets}, ${parsedExercise.workingSets},
                ${parsedExercise.repRangeMin}, ${parsedExercise.repRangeMax},
                ${parsedExercise.rir}, ${parsedExercise.restSeconds},
                ${parsedExercise.notes}
              )
            `;

            // Create substitutions
            for (const subName of parsedExercise.substitutions) {
              let subResult = await sql`
                SELECT * FROM exercises WHERE LOWER(name) = LOWER(${subName})
              `;

              if (subResult.length === 0) {
                subResult = await sql`
                  INSERT INTO exercises (name, category)
                  VALUES (${subName}, ${categorizeExercise(subName)})
                  RETURNING *
                `;
              }

              const subExercise = subResult[0];

              // Create substitution link (ignore if already exists)
              try {
                await sql`
                  INSERT INTO exercise_substitutions (primary_exercise_id, substitute_exercise_id)
                  VALUES (${exercise.id}, ${subExercise.id})
                  ON CONFLICT DO NOTHING
                `;
              } catch {
                // Ignore duplicate errors
              }
            }
          }
        }
      }
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Program imported successfully',
        program,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Excel import error:', errorMessage);
    console.error('Stack trace:', errorStack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to import program',
        details: errorMessage,
      }),
    };
  }
};

export { handler };
