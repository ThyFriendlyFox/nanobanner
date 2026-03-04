import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { env } = await import('$env/dynamic/private');
	const nanoBananaApiKey = (env as Record<string, string | undefined>)['NANO_BANANA_API_KEY'];
	return {
		nanoBananaEnabled: !!nanoBananaApiKey && nanoBananaApiKey.length > 0
	};
};
