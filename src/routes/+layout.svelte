<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';

	let { children } = $props();

	const base = $page.url.origin;
	const logoUrl = `${base}/logo.png`;
</script>

<svelte:head>
	<link rel="icon" href="/logo.png" type="image/png" />
	<meta property="og:image" content={logoUrl} />
	<meta property="og:title" content="NanoBanner" />
	<meta property="og:description" content="Resize and reframe images into platform‑perfect banners, posts, and prints. No accounts, no clutter—just upload, tweak, download." />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:image" content={logoUrl} />
</svelte:head>
{@render children()}
