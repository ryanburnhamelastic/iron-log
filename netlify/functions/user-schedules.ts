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

    // Verify Clerk JWT and get user ID
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const clerkUserId = authResult.clerkUserId;

    // Get user
    const users = await sql`SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}`;
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    const userId = users[0].id;

    // GET - Get user schedule
    if (event.httpMethod === 'GET') {
      const schedules = await sql`
        SELECT * FROM user_schedules
        WHERE user_id = ${userId}
        ORDER BY day_of_week
      `;

      // If no schedules exist, return defaults
      if (schedules.length === 0) {
        const defaults = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day_of_week: day,
          is_workout_day: false,
        }));
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(defaults),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(schedules),
      };
    }

    // PUT - Update schedule
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { schedules } = body;

      if (!schedules || !Array.isArray(schedules)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'schedules array is required' }),
        };
      }

      // Delete existing schedules
      await sql`DELETE FROM user_schedules WHERE user_id = ${userId}`;

      // Insert new schedules
      for (const schedule of schedules) {
        await sql`
          INSERT INTO user_schedules (user_id, day_of_week, is_workout_day)
          VALUES (${userId}, ${schedule.day_of_week}, ${schedule.is_workout_day})
        `;
      }

      const updatedSchedules = await sql`
        SELECT * FROM user_schedules
        WHERE user_id = ${userId}
        ORDER BY day_of_week
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedSchedules),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('User schedules API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
