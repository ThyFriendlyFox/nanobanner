<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from './$types';

	export let data: PageData;

	type AdjustmentMethod = 'fit' | 'fill' | 'refocus' | 'crop';

	type PresetId = 'twitter_banner' | 'instagram_post' | 'tshirt_print' | 'youtube_banner' | 'custom';

	type Preset = {
		id: PresetId;
		label: string;
		width: number | null;
		height: number | null;
	};

	const PRESETS: Preset[] = [
		{
			id: 'twitter_banner',
			label: 'Twitter / X Banner (1500 × 500)',
			width: 1500,
			height: 500
		},
		{
			id: 'instagram_post',
			label: 'Instagram Post (1080 × 1080)',
			width: 1080,
			height: 1080
		},
		{
			id: 'tshirt_print',
			label: 'T‑Shirt Print (2000 × 2000)',
			width: 2000,
			height: 2000
		},
		{
			id: 'youtube_banner',
			label: 'YouTube Banner (2560 × 1440)',
			width: 2560,
			height: 1440
		},
		{
			id: 'custom',
			label: 'Custom size',
			width: null,
			height: null
		}
	];

	let file: File | null = null;
	let originalUrl: string | null = null;
	let processedUrl: string | null = null;

	let selectedPresetId: PresetId = 'twitter_banner';
	let customWidth = 1500;
	let customHeight = 500;

	let method: AdjustmentMethod = 'fit';
	let useAi = false;
	let aiIntensity = 0.6;

	let cropX = 50;
	let cropY = 50;

	let isProcessing = false;
	let errorMessage: string | null = null;
	let infoMessage: string | null = null;
	let lastResultDimensions: { width: number; height: number } | null = null;

	const getSelectedPreset = () => PRESETS.find((p) => p.id === selectedPresetId) ?? PRESETS[0];

	const getTargetSize = () => {
		const preset = getSelectedPreset();

		if (preset.id === 'custom') {
			return {
				width: Math.max(1, Math.floor(customWidth || 1)),
				height: Math.max(1, Math.floor(customHeight || 1))
			};
		}

		return {
			width: preset.width ?? 1,
			height: preset.height ?? 1
		};
	};

	const resetState = () => {
		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (processedUrl) URL.revokeObjectURL(processedUrl);

		file = null;
		originalUrl = null;
		processedUrl = null;
		selectedPresetId = 'twitter_banner';
		customWidth = 1500;
		customHeight = 500;
		method = 'fit';
		aiIntensity = 0.6;
		cropX = 50;
		cropY = 50;
		isProcessing = false;
		errorMessage = null;
		infoMessage = null;
		lastResultDimensions = null;
	};

	const handleFileFromInput = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		const selected = target.files?.[0];

		if (!selected) return;
		loadFile(selected);
	};

	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const dropped = event.dataTransfer?.files?.[0];
		if (!dropped) return;
		loadFile(dropped);
	};

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
	};

	const loadFile = (newFile: File) => {
		if (!newFile.type.startsWith('image/')) {
			errorMessage = 'Please upload an image file (JPG, PNG, or similar).';
			return;
		}

		errorMessage = null;
		infoMessage = null;

		if (originalUrl) URL.revokeObjectURL(originalUrl);
		if (processedUrl) URL.revokeObjectURL(processedUrl);

		file = newFile;
		originalUrl = URL.createObjectURL(newFile);
		processedUrl = null;
		lastResultDimensions = null;

		void processImage();
	};

	const onPresetChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement;
		selectedPresetId = target.value as PresetId;
		infoMessage = null;
		if (file) void processImage();
	};

	const onMethodChange = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		method = target.value as AdjustmentMethod;
		infoMessage = null;
		if (file) void processImage();
	};

	const onCustomSizeChange = () => {
		infoMessage = null;
		if (file) void processImage();
	};

	const onAiIntensityChange = () => {
		infoMessage = null;
		if (file && (method === 'fill' || method === 'refocus')) void processImage();
	};

	const onCropChange = () => {
		infoMessage = null;
		if (file && method === 'crop') void processImage();
	};

	const processImage = async () => {
		if (!browser || !file || !originalUrl) return;

		isProcessing = true;
		errorMessage = null;

		const target = getTargetSize();
		const targetWidth = target.width;
		const targetHeight = target.height;

		if (targetWidth <= 0 || targetHeight <= 0) {
			isProcessing = false;
			errorMessage = 'Target size must be greater than zero.';
			return;
		}

		if (data?.nanoBananaEnabled && useAi) {
			try {
				const formData = new FormData();
				formData.set('image', file);
				formData.set('width', String(targetWidth));
				formData.set('height', String(targetHeight));
				formData.set('method', method);

				const res = await fetch('/api/nano-banana', { method: 'POST', body: formData });

				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body?.error ?? `Request failed (${res.status})`);
				}

				const blob = await res.blob();
				if (processedUrl) URL.revokeObjectURL(processedUrl);
				processedUrl = URL.createObjectURL(blob);
				lastResultDimensions = { width: targetWidth, height: targetHeight };
			} catch (err) {
				errorMessage = err instanceof Error ? err.message : 'Nano Banana processing failed';
			} finally {
				isProcessing = false;
			}
			return;
		}

		try {
			const image = new Image();
			image.src = originalUrl;

			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error('Unable to load the image.'));
			});

			if (image.width < targetWidth || image.height < targetHeight) {
				infoMessage =
					'Image is smaller than the target size. Result may look slightly soft when upscaled.';
			}

			const canvas = document.createElement('canvas');
			canvas.width = targetWidth;
			canvas.height = targetHeight;

			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Could not create drawing context.');

			ctx.save();

			const drawFit = () => {
				ctx.fillStyle = '#0f172a';
				ctx.fillRect(0, 0, targetWidth, targetHeight);
				const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
				const drawWidth = image.width * scale;
				const drawHeight = image.height * scale;
				const offsetX = (targetWidth - drawWidth) / 2;
				const offsetY = (targetHeight - drawHeight) / 2;
				ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
			};

			const drawFill = () => {
				const baseBlur = 15;
				const extraBlur = Math.round(aiIntensity * 20);
				ctx.filter = `blur(${baseBlur + extraBlur}px)`;
				ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
				ctx.filter = 'none';

				const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
				const drawWidth = image.width * scale;
				const drawHeight = image.height * scale;
				const offsetX = (targetWidth - drawWidth) / 2;
				const offsetY = (targetHeight - drawHeight) / 2;
				ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
			};

			const drawCrop = () => {
				const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
				const cropWidth = targetWidth / scale;
				const cropHeight = targetHeight / scale;
				const maxX = Math.max(0, image.width - cropWidth);
				const maxY = Math.max(0, image.height - cropHeight);
				const focusX = cropX / 100;
				const focusY = cropY / 100;
				const sx = maxX * focusX;
				const sy = maxY * focusY;
				ctx.drawImage(image, sx, sy, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
			};

			switch (method) {
				case 'fit': {
					drawFit();
					break;
				}
				case 'fill': {
					drawFill();
					break;
				}
				case 'refocus': {
					drawFill();
					infoMessage =
						'Refocus uses a smart fill-style preview. Advanced subject detection can be added later.';
					break;
				}
				case 'crop': {
					drawCrop();
					break;
				}
			}

			ctx.restore();

			if (processedUrl) URL.revokeObjectURL(processedUrl);
			const blob: Blob = await new Promise((resolve, reject) =>
				canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Unable to export image.'))), 'image/png')
			);

			const objectUrl = URL.createObjectURL(blob);
			processedUrl = objectUrl;
			lastResultDimensions = { width: targetWidth, height: targetHeight };
		} catch (error) {
			console.error(error);
			errorMessage =
				error instanceof Error ? error.message : 'Something went wrong while processing the image.';
		} finally {
			isProcessing = false;
		}
	};

	const downloadImage = async () => {
		if (!browser || !processedUrl) return;

		const link = document.createElement('a');
		link.href = processedUrl;
		const size = lastResultDimensions;
		const suffix = size ? `_${size.width}x${size.height}` : '';
		link.download = `nanobanner${suffix}.png`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const shareImage = async () => {
		if (!browser || !processedUrl) return;

		try {
			if ('share' in navigator && typeof navigator.share === 'function') {
				const response = await fetch(processedUrl);
				const blob = await response.blob();
				const shareFile = new File([blob], 'nanobanner.png', { type: blob.type });

				await navigator.share({
					files: [shareFile],
					title: 'NanoBanner',
					text: 'Created with NanoBanner'
				});
				return;
			}

			if (navigator.clipboard) {
				await navigator.clipboard.writeText(processedUrl);
				infoMessage = 'Image link copied to clipboard. You can paste it where you need it.';
			} else {
				infoMessage = 'Sharing is not supported in this browser. Please download the image instead.';
			}
		} catch (error) {
			console.error(error);
			errorMessage =
				'Unable to share image. Your browser or device may not support the Web Share API for files.';
		}
	};
</script>

<main class="min-h-screen bg-slate-50 text-slate-900">
	<section class="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-12 pt-8 sm:px-6 lg:px-8">
		<header>
			<h1 class="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
				NanoBanner
			</h1>
			<p class="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
				Resize and reframe a single image into platform‑perfect banners, posts, and prints.
				No accounts, no clutter—just upload, tweak, download.
			</p>
		</header>

		<!-- Top: Upload area -->
		<section
			class="relative rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 shadow-sm shadow-slate-100 outline-none transition hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 sm:p-8"
			on:drop={handleDrop}
			on:dragover={handleDragOver}
			role="group"
			aria-label="Image upload dropzone"
		>
			<div class="flex flex-col gap-6 md:flex-row md:items-center">
				<div class="flex-1 space-y-4">
					<p class="text-sm font-medium text-slate-900 sm:text-base">
						Upload a single image
					</p>
					<p class="text-xs text-slate-600 sm:text-sm">
						Drag &amp; drop your image here, or click to choose a file. NanoBanner works best with
						high‑resolution JPG or PNG files.
					</p>

					<label
						class="group inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 shadow-sm shadow-slate-500/30 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
					>
						<span>Choose image</span>
						<input
							type="file"
							accept="image/*"
							class="sr-only"
							on:change={handleFileFromInput}
						/>
					</label>

					<div class="flex items-center gap-3 text-[11px] text-slate-500 sm:text-xs">
						<span>Supported: JPG, PNG, WebP.</span>
						<span class="hidden sm:inline">Max 1 image at a time.</span>
					</div>
				</div>

				<div class="flex-1">
					<div
						class="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100/80"
					>
						{#if originalUrl}
							<img
								src={originalUrl}
								alt="Original upload preview"
								class="h-full w-full object-contain"
								loading="lazy"
							/>
						{:else}
							<div class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
								<p class="text-xs font-medium text-slate-500 sm:text-sm">
									Drop your image here to get started
								</p>
								<p class="text-[11px] text-slate-400 sm:text-xs">
									You&apos;ll see a live preview once an image is selected.
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- Middle: Configuration options -->
		{#if file}
			<section class="space-y-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-100 sm:p-7">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
					Configuration
				</h2>

				<div class="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)]">
					<!-- Left column: size + method -->
					<div class="space-y-5">
						<div class="space-y-2">
							<label
								for="preset"
								class="block text-xs font-medium uppercase tracking-wide text-slate-500"
							>
								Target size
							</label>
							<select
								id="preset"
								class="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
								bind:value={selectedPresetId}
								on:change={onPresetChange}
							>
								{#each PRESETS as preset}
									<option value={preset.id}>{preset.label}</option>
								{/each}
							</select>
						</div>

						{#if data?.nanoBananaEnabled}
							<div class="space-y-2">
								<p class="block text-xs font-medium uppercase tracking-wide text-slate-500">
									Adjustment mode
								</p>
								<div
									class="flex gap-0 rounded-xl border border-slate-200 bg-slate-50/60 p-1 shadow-sm"
									role="group"
									aria-label="Standard or AI adjustment"
								>
									<label
										class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-slate-200"
									>
										<input
											type="radio"
											class="sr-only"
											name="adjustment-mode"
											value="standard"
											checked={!useAi}
											on:change={() => {
												useAi = false;
												infoMessage = null;
												if (file) void processImage();
											}}
										/>
										Standard
									</label>
									<label
										class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-slate-200"
									>
										<input
											type="radio"
											class="sr-only"
											name="adjustment-mode"
											value="ai"
											checked={useAi}
											on:change={() => {
												useAi = true;
												infoMessage = null;
												if (file) void processImage();
											}}
										/>
										AI (Nano Banana)
									</label>
								</div>
							</div>
						{/if}

						{#if selectedPresetId === 'custom'}
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-1.5">
									<label for="custom-width" class="block text-xs font-medium text-slate-600">
										Width (px)
									</label>
									<input
										id="custom-width"
										type="number"
										min="1"
										step="1"
										class="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
										bind:value={customWidth}
										on:change={onCustomSizeChange}
									/>
								</div>
								<div class="space-y-1.5">
									<label for="custom-height" class="block text-xs font-medium text-slate-600">
										Height (px)
									</label>
									<input
										id="custom-height"
										type="number"
										min="1"
										step="1"
										class="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
										bind:value={customHeight}
										on:change={onCustomSizeChange}
									/>
								</div>
							</div>
						{/if}

						<div class="space-y-2">
							<p class="block text-xs font-medium uppercase tracking-wide text-slate-500">
								Adjustment method
							</p>
							<div class="grid gap-2 sm:grid-cols-2">
								<label
									class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 shadow-sm shadow-slate-100 ring-0 transition hover:border-slate-300 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:checked]:shadow-sky-100"
								>
									<input
										type="radio"
										class="h-3.5 w-3.5 text-sky-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
										name="method"
										value="fit"
										checked={method === 'fit'}
										on:change={onMethodChange}
									/>
									<span class="flex flex-col">
										<span class="text-xs font-semibold">Fit (default)</span>
										<span class="text-[11px] text-slate-500">
											Contain image inside target size, adding padding where needed.
										</span>
									</span>
								</label>

								<label
									class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 shadow-sm shadow-slate-100 ring-0 transition hover:border-slate-300 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:checked]:shadow-sky-100"
								>
									<input
										type="radio"
										class="h-3.5 w-3.5 text-sky-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
										name="method"
										value="fill"
										checked={method === 'fill'}
										on:change={onMethodChange}
									/>
									<span class="flex flex-col">
										<span class="text-xs font-semibold">Fill</span>
										<span class="text-[11px] text-slate-500">
											Use a blurred extension of the image to fill extra space.
										</span>
									</span>
								</label>

								<label
									class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 shadow-sm shadow-slate-100 ring-0 transition hover:border-slate-300 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:checked]:shadow-sky-100"
								>
									<input
										type="radio"
										class="h-3.5 w-3.5 text-sky-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
										name="method"
										value="refocus"
										checked={method === 'refocus'}
										on:change={onMethodChange}
									/>
									<span class="flex flex-col">
										<span class="text-xs font-semibold">Refocus</span>
										<span class="text-[11px] text-slate-500">
											Center key content with a smart fill‑style preview. Perfect for portraits.
										</span>
									</span>
								</label>

								<label
									class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 shadow-sm shadow-slate-100 ring-0 transition hover:border-slate-300 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:checked]:shadow-sky-100"
								>
									<input
										type="radio"
										class="h-3.5 w-3.5 text-sky-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
										name="method"
										value="crop"
										checked={method === 'crop'}
										on:change={onMethodChange}
									/>
									<span class="flex flex-col">
										<span class="text-xs font-semibold">Crop</span>
										<span class="text-[11px] text-slate-500">
											Tighten the frame with simple focus controls.
										</span>
									</span>
								</label>
							</div>
						</div>

						{#if method === 'fill' || method === 'refocus'}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs text-slate-600">
									<span class="font-medium">AI intensity</span>
									<span class="text-[11px] text-slate-500">
										{#if aiIntensity < 0.35}
											Subtle background
										{:else if aiIntensity < 0.7}
											Balanced
										{:else}
											Strong blur &amp; fill
										{/if}
									</span>
								</div>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									class="w-full accent-sky-600"
									bind:value={aiIntensity}
									on:input={onAiIntensityChange}
								/>
							</div>
						{/if}

						{#if method === 'crop'}
							<div class="space-y-3 rounded-xl bg-slate-50/80 p-3">
								<p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
									Crop focus
								</p>
								<div class="space-y-2">
									<label
										for="crop-horizontal"
										class="flex items-center justify-between text-[11px] text-slate-600"
									>
										<span>Horizontal</span>
										<span>{cropX}%</span>
									</label>
									<input
										id="crop-horizontal"
										type="range"
										min="0"
										max="100"
										step="1"
										class="w-full accent-sky-600"
										bind:value={cropX}
										on:input={onCropChange}
									/>
								</div>
								<div class="space-y-2">
									<label
										for="crop-vertical"
										class="flex items-center justify-between text-[11px] text-slate-600"
									>
										<span>Vertical</span>
										<span>{cropY}%</span>
									</label>
									<input
										id="crop-vertical"
										type="range"
										min="0"
										max="100"
										step="1"
										class="w-full accent-sky-600"
										bind:value={cropY}
										on:input={onCropChange}
									/>
								</div>
								<p class="text-[11px] text-slate-500">
									Move the focus point towards where faces or key content should stay visible.
								</p>
							</div>
						{/if}
					</div>

					<!-- Right column: preview + actions -->
					<div class="flex flex-col gap-4">
						<div class="space-y-2">
							<p class="text-xs font-medium uppercase tracking-wide text-slate-500">
								Preview
							</p>

							<div
								class="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
							>
								<div class="space-y-1.5">
									<p class="text-[11px] font-medium text-slate-600">Original</p>
									<div
										class="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
									>
										{#if originalUrl}
											<img
												src={originalUrl}
												alt="Original upload"
												class="h-full w-full object-contain"
											/>
										{:else}
											<div
												class="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-400"
											>
												Waiting for an image…
											</div>
										{/if}
									</div>
								</div>

								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										<p class="text-[11px] font-medium text-slate-600">
											Adjusted
										</p>
										{#if lastResultDimensions}
											<p class="text-[11px] text-slate-500">
												{lastResultDimensions.width} × {lastResultDimensions.height}px
											</p>
										{/if}
									</div>

									<div
										class="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-900/95"
									>
										{#if processedUrl}
											<img
												src={processedUrl}
												alt="Adjusted result preview"
												class="h-full w-full cursor-zoom-in object-contain"
											/>
										{:else}
											<div
												class="flex h-full flex-col items-center justify-center gap-1 px-3 text-center"
											>
												{#if isProcessing}
													<div
														class="h-4 w-4 animate-spin rounded-full border-[2px] border-slate-400 border-t-transparent"
													></div>
													<p class="text-[11px] text-slate-300">
														NanoBanner is preparing your preview…
													</p>
												{:else}
													<p class="text-[11px] text-slate-300">
														Choose a size and method to generate a preview.
													</p>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>

						{#if errorMessage}
							<div class="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
								{errorMessage}
							</div>
						{/if}

						{#if infoMessage}
							<div class="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
								{infoMessage}
							</div>
						{/if}

						<div
							class="mt-1 flex flex-col items-stretch justify-between gap-3 border-t border-dashed border-slate-200 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center"
						>
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
									on:click={resetState}
									disabled={!file && !processedUrl}
								>
									Reset
								</button>

								<button
									type="button"
									class="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-50 shadow-sm shadow-slate-500/40 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
									on:click={downloadImage}
									disabled={!processedUrl || isProcessing}
								>
									{#if isProcessing}
										<span
											class="mr-1 inline-flex h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-200 border-t-transparent"
										></span>
									{/if}
									Download
								</button>

								<button
									type="button"
									class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
									on:click={shareImage}
									disabled={!processedUrl || isProcessing}
								>
									Share
								</button>
							</div>

							<p class="text-[11px] text-right text-slate-500 sm:text-left">
								All processing happens in your browser. Nothing is uploaded to a server.
							</p>
						</div>
					</div>
				</div>
			</section>
		{/if}
	</section>
</main>
