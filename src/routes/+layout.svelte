<script>
	import { onMount, onDestroy } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initializeDataStore, cleanupDataStore } from '$lib/stores/dataStore';
	
	let { children } = $props();

	onMount(async () => {
		// Initialize data store on app load
		// This will load cached data immediately and fetch fresh data in background
		await initializeDataStore();
	});

	onDestroy(() => {
		// Cleanup subscriptions when app is destroyed
		cleanupDataStore();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
