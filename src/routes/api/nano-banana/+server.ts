import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { env } = await import('$env/dynamic/private');
	const apiKey = (env as Record<string, string | undefined>)['NANO_BANANA_API_KEY'];

	if (!apiKey?.length) {
		return new Response(JSON.stringify({ error: 'Nano Banana API not configured' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const formData = await request.formData();
	const image = formData.get('image') as File | null;
	const width = Number(formData.get('width') ?? 0);
	const height = Number(formData.get('height') ?? 0);
	const method = String(formData.get('method') ?? 'fit');

	if (!image?.type?.startsWith('image/') || width <= 0 || height <= 0) {
		return json({ error: 'Invalid request: image, width, and height required' }, { status: 400 });
	}

	try {
		// TODO: Call Nano Banana API with apiKey (e.g. Authorization: Bearer <key>), image, and options.
		// For now, return the original image so the UI works; replace with real API call.
		const arrayBuffer = await image.arrayBuffer();
		return new Response(arrayBuffer, {
			headers: {
				'Content-Type': image.type || 'image/png'
			}
		});
	} catch (err) {
		console.error('[nano-banana]', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Nano Banana processing failed' },
			{ status: 502 }
		);
	}
};
