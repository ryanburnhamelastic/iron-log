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

    // Verify Clerk JWT for authenticated requests
    const authResult = await authenticateRequest(event);

    // GET - List exercises or get by ID
    if (event.httpMethod === 'GET') {
      const pathParts = event.path.split('/').filter(Boolean);
      const exerciseId = pathParts[pathParts.length - 1];

      // Check if we're getting substitutions
      if (event.path.includes('/substitutions')) {
        const parentId = pathParts[pathParts.length - 2];
        const result = await sql`
          SELECT e.* FROM exercises e
          JOIN exercise_substitutions es ON e.id = es.substitute_exercise_id
          WHERE es.primary_exercise_id = ${parentId}
        `;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result),
        };
      }

      // Get single exercise by ID
      if (exerciseId && exerciseId !== 'exercises') {
        const result = await sql`
          SELECT * FROM exercises WHERE id = ${exerciseId}
        `;

        if (result.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Exercise not found' }),
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result[0]),
        };
      }

      // List exercises with optional category filter
      const category = event.queryStringParameters?.category;

      let result;
      if (category) {
        result = await sql`
          SELECT * FROM exercises WHERE category = ${category} ORDER BY name
        `;
      } else {
        result = await sql`
          SELECT * FROM exercises ORDER BY name
        `;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
    }

    // POST - Create exercise (requires auth)
    if (event.httpMethod === 'POST') {
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
        };
      }

      const body = JSON.parse(event.body || '{}');
      const { name, category, equipment, description } = body;

      if (!name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Name is required' }),
        };
      }

      // Check if exercise already exists
      const existing = await sql`
        SELECT * FROM exercises WHERE LOWER(name) = LOWER(${name})
      `;

      if (existing.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(existing[0]),
        };
      }

      const result = await sql`
        INSERT INTO exercises (name, category, equipment, description)
        VALUES (${name}, ${category || null}, ${equipment || null}, ${description || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(result[0]),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Exercises API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
