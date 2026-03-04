import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI, Modality } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';

function buildPrompt(method: string, width: number, height: number): string {
	const dimensions = `${width}×${height} pixels`;
	switch (method) {
		case 'fill':
			return `Reframe this image to fit exactly ${dimensions}. Extend or fill the background naturally so the entire frame is filled with no letterboxing. Keep the main subject intact and blend the extended areas seamlessly. Output only the resulting image.`;
		case 'refocus':
			return `Reframe this image to ${dimensions}. Center and emphasize the main subject (e.g. people, product, or focal point). Crop or extend the background as needed so the output is exactly ${dimensions} with the subject well-centered. Output only the resulting image.`;
		case 'crop':
			return `Crop this image to exactly ${dimensions}, keeping the most important part of the scene centered. Output only the resulting image.`;
		case 'fit':
		default:
			return `Reframe this image to fit inside ${dimensions} without cropping the main content. Add padding or letterboxing if needed so the output is exactly ${dimensions}. Output only the resulting image.`;
	}
}

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
		const arrayBuffer = await image.arrayBuffer();
		const base64 = Buffer.from(arrayBuffer).toString('base64');
		const mimeType = image.type || 'image/png';
		const prompt = buildPrompt(method, width, height);

		const ai = new GoogleGenAI({ apiKey });
		const model = (env as Record<string, string | undefined>)['NANO_BANANA_MODEL'] || DEFAULT_MODEL;

		const response = await ai.models.generateContent({
			model,
			contents: [
				{
					role: 'user',
					parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }]
				}
			],
			config: {
				responseModalities: [Modality.IMAGE]
			}
		});

		const candidate = response.candidates?.[0];
		if (!candidate?.content?.parts?.length) {
			const text = response.text ?? 'No image was generated.';
			return json({ error: `Nano Banana returned no image. ${text}`.trim() }, { status: 502 });
		}

		for (const part of candidate.content.parts) {
			const blob = part.inlineData;
			if (blob?.data) {
				const buffer = Buffer.from(blob.data, 'base64');
				return new Response(buffer, {
					headers: {
						'Content-Type': blob.mimeType || 'image/png'
					}
				});
			}
		}

		return json({ error: 'Nano Banana response did not contain an image.' }, { status: 502 });
	} catch (err) {
		console.error('[nano-banana]', err);
		const message = err instanceof Error ? err.message : 'Nano Banana processing failed';
		return json({ error: message }, { status: 502 });
	}
};
