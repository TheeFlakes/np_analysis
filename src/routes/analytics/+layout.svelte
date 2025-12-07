<script>
	import { page } from '$app/stores';
	let sidebarOpen = true;

	const toggleSidebar = () => {
		sidebarOpen = !sidebarOpen;
	};

	const menuItems = [
		{ name: 'Dashboard', path: '/analytics', icon: 'dashboard' },
		{ name: 'Orders', path: '/analytics/orders', icon: 'orders' },
		{ name: 'Customers', path: '/analytics/customers', icon: 'customers' },
		{ name: 'Products', path: '/analytics/products', icon: 'products' },
		{ name: 'JSON', path: '/analytics/json', icon: 'json' }
	];
</script>

<div class="flex h-screen bg-gray-100">
	<!-- Sidebar -->
	<aside
		class="bg-white border-r border-gray-200 transition-all duration-300 {sidebarOpen
			? 'w-64'
			: 'w-20'} fixed h-screen lg:relative z-40"
	>
		<!-- Logo Section -->
		<div class="flex items-center justify-between h-20 px-4 border-b border-gray-200">
			{#if sidebarOpen}
				<div class="flex items-center gap-3">
					<img src="/lea_page.jpg" alt="NP Millers Logo" class="w-16 h-16 object-contain" />
					<span class="text-lg font-semibold text-gray-800">NP Millers</span>
				</div>
			{/if}
		</div>

		<!-- Toggle Button -->
		<button
			on:click={toggleSidebar}
			title="Toggle sidebar"
			class="absolute -right-3 top-20 bg-white border border-gray-200 rounded-full p-1 hover:bg-gray-50 hidden lg:flex items-center justify-center w-6 h-6 shadow-sm"
		>
			<svg
				class="w-4 h-4 text-gray-600 transition-transform {sidebarOpen ? 'rotate-0' : 'rotate-180'}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>

		<!-- Navigation Menu -->
		<nav class="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
			{#each menuItems as item}
				<a
					href={item.path}
					class="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors {$page.url.pathname === item.path
						? 'bg-blue-50 text-blue-600'
						: 'text-gray-600 hover:bg-gray-50'}"
				>
					<!-- Dashboard Icon -->
					{#if item.icon === 'dashboard'}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m-4 4l-4-4m4 4v-2.5a2.5 2.5 0 015 0v2.5m-5 0h5"
							/>
						</svg>
					{/if}

					<!-- Orders Icon -->
					{#if item.icon === 'orders'}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
							/>
						</svg>
					{/if}

					<!-- Customers Icon -->
					{#if item.icon === 'customers'}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 016-6h0a6 6 0 016 6v1a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1a2 2 0 012-2h0a2 2 0 01-2 2v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a6 6 0 016-6h0a6 6 0 016 6v1"
							/>
						</svg>
					{/if}

					<!-- Products Icon -->
					{#if item.icon === 'products'}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M20 7l-8-4-8 4m0 0l8-4m8 4v10l-8 4m0-10L4 7m8 4v10m0-10l8 4m-8-4l-8-4"
							/>
						</svg>
					{/if}

					<!-- JSON Icon -->
					{#if item.icon === 'json'}
						<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
					{/if}

					{#if sidebarOpen}
						<span class="text-sm font-medium">{item.name}</span>
					{/if}
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Overlay for mobile when sidebar is open -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30"
			on:click={toggleSidebar}
			role="button"
			tabindex="0"
			on:keydown={(e) => e.key === 'Escape' && toggleSidebar()}
		></div>
	{/if}

	<!-- Main Content -->
	<main class="flex-1 overflow-auto ml-0 lg:ml-0">
		<slot />
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
