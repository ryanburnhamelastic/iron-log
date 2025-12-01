import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    // Verify Clerk JWT
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const pathParts = event.path.split('/').filter(Boolean);
    const setLogId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // POST - Create set log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        exercise_log_id,
        set_number,
        set_type = 'working',
        weight_value,
        weight_unit = 'lbs',
        reps_completed,
        rir_actual,
      } = body;

      if (!exercise_log_id || !set_number) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'exercise_log_id and set_number are required' }),
        };
      }

      const [setLog] = await sql`
        INSERT INTO set_logs (exercise_log_id, set_number, set_type, weight_value, weight_unit, reps_completed, rir_actual)
        VALUES (${exercise_log_id}, ${set_number}, ${set_type}, ${weight_value || null}, ${weight_unit}, ${reps_completed || null}, ${rir_actual || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(setLog),
      };
    }

    // PUT - Update set log
    if (event.httpMethod === 'PUT' && setLogId && setLogId !== 'set-logs') {
      const body = JSON.parse(event.body || '{}');
      const { weight_value, weight_unit, reps_completed, rir_actual, is_pr } = body;

      const [setLog] = await sql`
        UPDATE set_logs
        SET
          weight_value = COALESCE(${weight_value}, weight_value),
          weight_unit = COALESCE(${weight_unit}, weight_unit),
          reps_completed = COALESCE(${reps_completed}, reps_completed),
          rir_actual = COALESCE(${rir_actual}, rir_actual),
          is_pr = COALESCE(${is_pr}, is_pr)
        WHERE id = ${setLogId}
        RETURNING *
      `;

      if (!setLog) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Set log not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(setLog),
      };
    }

    // DELETE - Delete set log
    if (event.httpMethod === 'DELETE' && setLogId && setLogId !== 'set-logs') {
      await sql`DELETE FROM set_logs WHERE id = ${setLogId}`;
      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Set logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
