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

    // POST - Create exercise log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { workout_log_id, exercise_id, template_exercise_id, exercise_order } = body;

      if (!workout_log_id || !exercise_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workout_log_id and exercise_id are required' }),
        };
      }

      const [exerciseLog] = await sql`
        INSERT INTO exercise_logs (workout_log_id, exercise_id, template_exercise_id, exercise_order)
        VALUES (${workout_log_id}, ${exercise_id}, ${template_exercise_id || null}, ${exercise_order || 1})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(exerciseLog),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Exercise logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
