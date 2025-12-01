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

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim();
    const secondCell = String(row[1] || '').trim();

    // Detect Block headers
    if (secondCell.toLowerCase().includes('block')) {
      const blockNum = parseInt(secondCell.match(/\d+/)?.[0] || '1');
      currentBlock = {
        blockNumber: blockNum,
        name: secondCell,
        weeks: [],
      };
      program.blocks.push(currentBlock);
      continue;
    }

    // Detect Week headers
    if (secondCell.toLowerCase().includes('week')) {
      if (!currentBlock) {
        currentBlock = { blockNumber: 1, name: 'Block 1', weeks: [] };
        program.blocks.push(currentBlock);
      }

      const weekNum = parseInt(secondCell.match(/\d+/)?.[0] || '1');
      let weekType: 'intro' | 'normal' | 'deload' = 'normal';
      const lowerSecond = secondCell.toLowerCase();
      if (lowerSecond.includes('intro')) weekType = 'intro';
      if (lowerSecond.includes('deload')) weekType = 'deload';

      currentWeek = {
        weekNumber: weekNum,
        name: secondCell,
        weekType,
        workouts: [],
      };
      currentBlock.weeks.push(currentWeek);
      continue;
    }

    // Detect workout day headers (Full Body, Upper, Lower, Arms/Delts)
    const workoutNames = ['full body', 'upper', 'lower', 'arms', 'push', 'pull', 'legs'];
    const lowerSecond = secondCell.toLowerCase();
    if (workoutNames.some((w) => lowerSecond.includes(w))) {
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
        name: secondCell,
        dayNumber: currentWeek.workouts.length + 1,
        exercises: [],
      };
      currentWeek.workouts.push(currentWorkout);
      exerciseOrder = 0;
      continue;
    }

    // Detect rest day markers
    if (lowerSecond.includes('rest day')) {
      continue;
    }

    // Parse exercise rows - look for exercise name pattern
    // Skip header rows (containing "Exercise", "Load", "Reps", etc.)
    if (
      secondCell &&
      !lowerSecond.includes('exercise') &&
      !lowerSecond.includes('load') &&
      !lowerSecond.includes('reps') &&
      !lowerSecond.includes('set 1') &&
      !lowerSecond.includes('set 2') &&
      currentWorkout
    ) {
      // This looks like an exercise row
      const exerciseName = secondCell;

      // Parse working sets (column index ~5)
      let workingSets = 2;
      if (row[5]) {
        const setsVal = parseInt(String(row[5]));
        if (!isNaN(setsVal) && setsVal > 0 && setsVal < 10) {
          workingSets = setsVal;
        }
      }

      // Parse rep range (column index ~6) - might be a date or range string
      let repMin = 8;
      let repMax = 12;
      const repCell = String(row[6] || '');
      const repMatch = repCell.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (repMatch) {
        repMin = parseInt(repMatch[1]);
        repMax = parseInt(repMatch[2]);
      } else if (repCell.includes('2025')) {
        // Date format from Excel - try to parse differently
        // This appears to be a date bug in the Excel file
        repMin = 6;
        repMax = 8;
      }

      // Parse RIR from failure columns (columns ~11, 12)
      let rir: number | null = null;
      const rirCol1 = row[11];
      const rirCol2 = row[12];
      if (typeof rirCol1 === 'number' && rirCol1 >= 0 && rirCol1 <= 4) {
        rir = rirCol1;
      } else if (typeof rirCol2 === 'number' && rirCol2 >= 0 && rirCol2 <= 4) {
        rir = rirCol2;
      }

      // Parse rest time (column ~13)
      let restSeconds = 120;
      const restCell = String(row[13] || '');
      const restMatch = restCell.match(/(\d+)\s*[-–]?\s*(\d*)\s*min/);
      if (restMatch) {
        const minRest = parseInt(restMatch[1]);
        restSeconds = minRest * 60;
      }

      // Parse notes (column ~16)
      const notes = row[16] ? String(row[16]).trim() : null;

      // Parse substitutions (columns ~14, 15)
      const substitutions: string[] = [];
      if (row[14] && String(row[14]).trim() && !String(row[14]).toLowerCase().includes('see notes')) {
        substitutions.push(String(row[14]).trim());
      }
      if (row[15] && String(row[15]).trim() && !String(row[15]).toLowerCase().includes('see notes')) {
        substitutions.push(String(row[15]).trim());
      }

      // Parse warmup sets (column ~3 or 4)
      let warmupSets = 0;
      const warmupCell = String(row[3] || row[4] || '');
      const warmupMatch = warmupCell.match(/(\d+)/);
      if (warmupMatch) {
        warmupSets = parseInt(warmupMatch[1]);
        if (warmupSets > 5) warmupSets = 0; // Likely not warmup sets
      }

      exerciseOrder++;
      currentWorkout.exercises.push({
        name: exerciseName,
        warmupSets,
        workingSets,
        repRangeMin: repMin,
        repRangeMax: repMax,
        rir,
        restSeconds,
        notes,
        substitutions,
        category: categorizeExercise(exerciseName),
      });
    }
  }

  return program;
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
