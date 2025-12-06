<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import pb from '$lib/pocketbase';

	// Date Range Filter
	let dateRange = 'last30'; // 'last30', 'today', 'all', 'custom'
	let customStartDate = '';
	let customEndDate = '';
	let showDatePicker = false;

	// Real-time data state
	let totalOrders = 0;
	let totalRevenue = 0;
	let totalCustomers = 0;
	let topSellingProduct = { name: '', quantity: 0 };

	// KPI Data
	let kpis = [
		{ label: 'Total Orders', value: '0', icon: 'box', color: 'bg-blue-50', yesterdayValue: '0', percentChange: 0, isPositive: true, allTimeValue: '0' },
		{ label: 'Revenue', value: 'KES 0', icon: 'chart', color: 'bg-green-50', yesterdayValue: 'KES 0', percentChange: 0, isPositive: true, allTimeValue: 'KES 0' },
		{ label: 'Top-Selling Product', value: '', subtext: '', icon: 'grain', color: 'bg-yellow-50' },
		{ label: 'Total Customers', value: '0', icon: 'users', color: 'bg-purple-50', yesterdayValue: '0', percentChange: 0, isPositive: true, allTimeValue: '0' }
	];

	// Product Mix Data (will be updated in real-time)
	let productMix: Array<{ name: string; value: number; color: string }> = [];

	// Orders Over Time Data (Last 30 days - Daily Revenue)
	let ordersOverTime: Array<{ day: string; revenue: number }> = [];
	let maxOrderQuantity = 0;
	let avgOrderQuantity = 0;

	// Top 10 Customers
	let topCustomers: Array<{ name: string; bales: number }> = [];

	// Top Products by Revenue
	let topProductsByRevenue: Array<{ name: string; revenue: number; color: string }> = [];
	let maxProductRevenue = 0;

	// Sales by Region (will be updated in real-time)
	let salesByRegion: Array<{ region: string; bales: number }> = [];

	// Standard color scheme for consistency
	const STATUS_COLORS = {
		Processed: '#10B981',    // Green
		Dispatched: '#3B82F6',    // Blue
		Pending: '#F59E0B'        // Orange/Yellow
	};
	
	// Distinctive, high-contrast colors for Product Mix chart (colorblind-friendly)
	const CHART_COLORS = [
		'#3B82F6',  // Blue (consistent with Dispatched status)
		'#059669',  // Emerald Green
		'#EA580C',  // Bright Orange
		'#DC2626',  // Red
		'#7C3AED',  // Violet/Purple
		'#0891B2'   // Cyan/Teal
	];

	// Order Status Distribution
	let orderStatus = [
		{ status: 'Processed', count: 0, color: STATUS_COLORS.Processed, percentage: 0 },
		{ status: 'Dispatched', count: 0, color: STATUS_COLORS.Dispatched, percentage: 0 },
		{ status: 'Pending', count: 0, color: STATUS_COLORS.Pending, percentage: 0 }
	];

	// Recent Orders Table
	let recentOrders: Array<any> = [];

	// Hover state for charts
	let hoveredProductIndex: number | null = null;
	let hoveredProductRevenueIndex: number | null = null;
	let hoveredStatusIndex: number | null = null;
	let hoveredOrderIndex: number | null = null;
	let hoveredOrdersOverTimeX: number | null = null;
	let hoveredOrdersOverTimeData: { day: string; revenue: number } | null = null;

	function getIconSVG(iconName: string): string {
		const icons: Record<string, string> = {
			box: '<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M5 2a2 2 0 012-2h10a2 2 0 012 2v1h3a1 1 0 010 2h-1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5H1a1 1 0 010-2h3V2zm10 18H9v-4h6v4zm4-11H5v7h14v-7z"/></svg>',
			chart: '<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4 4h2v14h-2zm4-2h2v16h-2z"/></svg>',
			grain: '<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 3c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H8zm0 2h8v4H8V5zm-1 8h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H3zm4 0h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>',
			users: '<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'
		};
		return icons[iconName] || '';
	}

	// Format large numbers for better readability (e.g., 1.2M instead of 1,200,000)
	function formatLargeNumber(num: number): string {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + 'M';
		} else if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toLocaleString();
	}

	// Real-time data calculation functions
	function getDateRange() {
		const now = new Date();
		let startDate: Date;
		let endDate: Date;
		
		if (dateRange === 'today') {
			startDate = new Date(now);
			startDate.setHours(0, 0, 0, 0);
			endDate = new Date(now);
			endDate.setHours(23, 59, 59, 999);
		} else if (dateRange === 'last30') {
			startDate = new Date(now);
			startDate.setDate(startDate.getDate() - 30);
			startDate.setHours(0, 0, 0, 0);
			endDate = new Date(now);
			endDate.setHours(23, 59, 59, 999);
		} else if (dateRange === 'custom') {
			startDate = customStartDate ? new Date(customStartDate) : new Date(0);
			startDate.setHours(0, 0, 0, 0);
			endDate = customEndDate ? new Date(customEndDate) : now;
			endDate.setHours(23, 59, 59, 999);
		} else {
			startDate = new Date(0); // 'all' - from beginning of time
			endDate = new Date(now);
			endDate.setHours(23, 59, 59, 999);
		}
		
		return { startDate, endDate };
	}

	function filterByDateRange(items: any[]): any[] {
		const { startDate, endDate } = getDateRange();
		return items.filter((item) => {
			const itemDate = new Date(item.created);
			return itemDate >= startDate && itemDate <= endDate;
		});
	}

	async function loadInitialData() {
		try {
			// Load order_items with product expansion
			const orderItems = await pb.collection('order_items').getList(1, 500, {
				expand: 'product'
			});

			// Load products
			const products = await pb.collection('products').getList(1, 500);

			// Load customers
			const customers = await pb.collection('customers').getList(1, 500);

			// Load orders
			const orders = await pb.collection('orders').getList(1, 500);

			updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
		} catch (error) {
			console.error('Error loading initial data:', error);
		}
	}

	async function updateAllMetrics(orderItems: any[], products: any[], customers: any[], orders: any[]) {
		// Apply date range filter to relevant data
		const filteredOrders = filterByDateRange(orders);
		const filteredOrderItems = orderItems.filter(oi => filteredOrders.some(o => o.id === oi.order));

		// Calculate Today's metrics
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		// Filter today's and yesterday's orders
		const todaysOrders = filteredOrders.filter(o => {
			const orderDate = new Date(o.created);
			orderDate.setHours(0, 0, 0, 0);
			return orderDate.getTime() === today.getTime();
		});

		const yesterdaysOrders = filteredOrders.filter(o => {
			const orderDate = new Date(o.created);
			orderDate.setHours(0, 0, 0, 0);
			return orderDate.getTime() === yesterday.getTime();
		});

		// Calculate Total Orders
		totalOrders = todaysOrders.length;
		const yesterdayOrders = yesterdaysOrders.length;
		const orderChange = totalOrders - yesterdayOrders;
		const orderPercentChange = yesterdayOrders > 0 ? Math.round((orderChange / yesterdayOrders) * 100) : (totalOrders > 0 ? 100 : 0);
		const allTimeOrders = orders.length; // All orders regardless of date filter
		kpis[0].value = totalOrders.toLocaleString();
		kpis[0].yesterdayValue = yesterdayOrders.toLocaleString();
		kpis[0].percentChange = orderPercentChange;
		kpis[0].isPositive = orderChange >= 0;
		kpis[0].allTimeValue = allTimeOrders.toLocaleString();

		// Calculate Total Revenue (sum of all invoice amounts)
		totalRevenue = todaysOrders.reduce((sum, order) => sum + (order.invoice_amount || 0), 0);
		const yesterdayRevenue = yesterdaysOrders.reduce((sum, order) => sum + (order.invoice_amount || 0), 0);
		const revenueChange = totalRevenue - yesterdayRevenue;
		const revenuePercentChange = yesterdayRevenue > 0 ? Math.round((revenueChange / yesterdayRevenue) * 100) : (totalRevenue > 0 ? 100 : 0);
		const allTimeRevenue = orders.reduce((sum, order) => sum + (order.invoice_amount || 0), 0);
		kpis[1].value = 'KES ' + totalRevenue.toLocaleString();
		kpis[1].yesterdayValue = 'KES ' + yesterdayRevenue.toLocaleString();
		kpis[1].percentChange = revenuePercentChange;
		kpis[1].isPositive = revenueChange >= 0;
		kpis[1].allTimeValue = 'KES ' + allTimeRevenue.toLocaleString();

		// Calculate Orders Over Time - Daily Revenue (adapts to date range)
		const { startDate, endDate } = getDateRange();
		const days = new Map<string, number>();
		
		// Initialize days based on date range
		const currentDate = new Date(startDate);
		currentDate.setHours(0, 0, 0, 0);
		const end = new Date(endDate);
		end.setHours(23, 59, 59, 999);
		
		// For "all time" or very long ranges, limit to last 365 days for performance
		const maxDays = 365;
		const daysDiff = Math.ceil((end.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
		const daysToShow = daysDiff > maxDays ? maxDays : daysDiff;
		
		// If range is too large, show last N days
		if (daysDiff > maxDays) {
			const adjustedStart = new Date(end);
			adjustedStart.setDate(adjustedStart.getDate() - maxDays);
			adjustedStart.setHours(0, 0, 0, 0);
			
			for (let d = new Date(adjustedStart); d <= end; d.setDate(d.getDate() + 1)) {
				const date = new Date(d);
				date.setHours(0, 0, 0, 0);
				const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
				days.set(dayLabel, 0);
			}
		} else {
			// Show all days in the range
			for (let d = new Date(currentDate); d <= end; d.setDate(d.getDate() + 1)) {
				const date = new Date(d);
				date.setHours(0, 0, 0, 0);
				const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
				days.set(dayLabel, 0);
			}
		}
		
		// Sum revenue by day from filtered orders
		filteredOrders.forEach((order) => {
			const orderDate = new Date(order.created);
			orderDate.setHours(0, 0, 0, 0);
			
			const dayLabel = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			
			if (days.has(dayLabel)) {
				days.set(dayLabel, (days.get(dayLabel) || 0) + (order.invoice_amount || 0));
			}
		});

		// Convert to array format for chart, sorted by date
		ordersOverTime = Array.from(days.entries())
			.map(([day, revenue]) => ({ day, revenue }))
			.sort((a, b) => {
				// Parse dates for proper sorting
				const dateA = new Date(a.day);
				const dateB = new Date(b.day);
				return dateA.getTime() - dateB.getTime();
			});

		// Calculate max and average revenue
		const revenues = ordersOverTime.map(o => o.revenue);
		maxOrderQuantity = Math.max(...revenues, 0);
		avgOrderQuantity = revenues.length > 0 ? Math.round(revenues.reduce((a, b) => a + b, 0) / revenues.length) : 0;

		// Calculate Product Mix (sum quantities by product)
		const productQuantities = new Map<string, { name: string; quantity: number; color: string }>();
		let colorIndex = 0;

		filteredOrderItems.forEach((item) => {
			const product = products.find(p => p.id === item.product);
			if (product) {
				const key = `${product.name} ${product.size}`;
				const existing = productQuantities.get(key);
				if (existing) {
					existing.quantity += item.quantity;
				} else {
					productQuantities.set(key, {
						name: key,
						quantity: item.quantity,
						color: CHART_COLORS[colorIndex % CHART_COLORS.length]
					});
					colorIndex++;
				}
			}
		});

		// Convert to array and calculate percentages
		const totalQuantity = Array.from(productQuantities.values()).reduce((sum, p) => sum + p.quantity, 0);
		productMix = Array.from(productQuantities.values())
			.map(p => ({
				...p,
				value: totalQuantity > 0 ? Math.round((p.quantity / totalQuantity) * 100) : 0
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, 4); // Top 4 products

		// Find top-selling product
		if (productMix.length > 0) {
			const topProduct = productMix[0];
			topSellingProduct = { name: topProduct.name, quantity: topProduct.value };
			kpis[2].value = topProduct.name;
			kpis[2].subtext = `${productMix[0].value}% of sales`;
		}

		// Calculate Total Customers (count unique customers in filtered orders)
		const filteredCustomerIds = new Set(filteredOrders.map(o => o.customer));
		const yesterdaysCustomerIds = new Set(yesterdaysOrders.map(o => o.customer));
		totalCustomers = filteredCustomerIds.size;
		const yesterdayCustomers = yesterdaysCustomerIds.size;
		const customerChange = totalCustomers - yesterdayCustomers;
		const customerPercentChange = yesterdayCustomers > 0 ? Math.round((customerChange / yesterdayCustomers) * 100) : (totalCustomers > 0 ? 100 : 0);
		const allTimeCustomers = customers.length; // All customers
		kpis[3].value = totalCustomers.toLocaleString();
		kpis[3].yesterdayValue = yesterdayCustomers.toLocaleString();
		kpis[3].percentChange = customerPercentChange;
		kpis[3].isPositive = customerChange >= 0;
		kpis[3].allTimeValue = allTimeCustomers.toLocaleString();

		// Calculate Top 10 Customers by total quantity
		const customerQuantities = new Map<string, { id: string; name: string; quantity: number }>();
		filteredOrderItems.forEach((item) => {
			const order = filteredOrders.find(o => o.id === item.order);
			if (order) {
				const customer = customers.find(c => c.id === order.customer);
				if (customer) {
					const existing = customerQuantities.get(customer.id);
					if (existing) {
						existing.quantity += item.quantity;
					} else {
						customerQuantities.set(customer.id, {
							id: customer.id,
							name: customer.name,
							quantity: item.quantity
						});
					}
				}
			}
		});

		topCustomers = Array.from(customerQuantities.values())
			.map(c => ({ name: c.name, bales: c.quantity }))
			.sort((a, b) => b.bales - a.bales)
			.slice(0, 10);

		// Calculate Top Products by Revenue
		const productRevenue = new Map<string, { name: string; revenue: number }>();
		
		// Group order items by order to calculate proportional revenue
		filteredOrders.forEach((order) => {
			const orderItemsForOrder = filteredOrderItems.filter(oi => oi.order === order.id);
			const totalQuantity = orderItemsForOrder.reduce((sum, oi) => sum + (oi.quantity || 0), 0);
			const orderRevenue = order.invoice_amount || 0;
			
			if (totalQuantity > 0) {
				orderItemsForOrder.forEach((item) => {
					const product = products.find(p => p.id === item.product);
					if (product) {
						const key = `${product.name} ${product.size}`;
						// Distribute revenue proportionally based on quantity
						const itemRevenue = (orderRevenue * (item.quantity || 0)) / totalQuantity;
						
						const existing = productRevenue.get(key);
						if (existing) {
							existing.revenue += itemRevenue;
						} else {
							productRevenue.set(key, {
								name: key,
								revenue: itemRevenue
							});
						}
					}
				});
			}
		});

		// Convert to array, sort by revenue, and assign colors
		topProductsByRevenue = Array.from(productRevenue.values())
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 5)
			.map((product, index) => ({
				...product,
				color: CHART_COLORS[index % CHART_COLORS.length]
			}));

		// Calculate max revenue for scaling
		maxProductRevenue = topProductsByRevenue.length > 0 
			? Math.max(...topProductsByRevenue.map(p => p.revenue), 0) 
			: 0;

		// Calculate Sales by Region (from customer locations)
		const regionQuantities = new Map<string, number>();
		filteredOrderItems.forEach((item) => {
			const order = filteredOrders.find(o => o.id === item.order);
			if (order) {
				const customer = customers.find(c => c.id === order.customer);
				if (customer && customer.region) {
					regionQuantities.set(
						customer.region,
						(regionQuantities.get(customer.region) || 0) + item.quantity
					);
				}
			}
		});

		salesByRegion = Array.from(regionQuantities.entries())
			.map(([region, bales]) => ({ region, bales }))
			.sort((a, b) => b.bales - a.bales);

		// Calculate Order Status Distribution
		const statusMap = new Map<string, number>();
		filteredOrders.forEach((order) => {
			const status = order.status || 'Pending';
			statusMap.set(status, (statusMap.get(status) || 0) + 1);
		});

		const totalStatusCount = filteredOrders.length || 1;
		orderStatus = orderStatus.map((status) => ({
			...status,
			count: statusMap.get(status.status) || 0,
			percentage: Math.round(((statusMap.get(status.status) || 0) / totalStatusCount) * 100)
		}));

		// Update Recent Orders
		recentOrders = filteredOrders
			.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
			.slice(0, 7)
			.map((order) => {
				const customer = customers.find(c => c.id === order.customer);
				const orderItemsForOrder = filteredOrderItems.filter(oi => oi.order === order.id);
				const itemsText = orderItemsForOrder
					.map((oi) => {
						const product = products.find(p => p.id === oi.product);
						return product ? `${product.name} ${product.size} (${oi.quantity})` : '';
					})
					.join(', ');

				const statusColor = order.status === 'Processed' ? 'bg-green-100 text-green-800' :
					order.status === 'Dispatched' ? 'bg-blue-100 text-blue-800' : 
					order.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';

				return {
					date: new Date(order.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
					customer: customer?.name || 'Unknown',
					region: customer?.region || 'Unknown',
					items: itemsText,
					status: order.status || 'Pending',
					statusColor
				};
			});

		kpis = kpis; // Trigger reactivity
		productMix = productMix;
		ordersOverTime = ordersOverTime;
		topCustomers = topCustomers;
		topProductsByRevenue = topProductsByRevenue;
		salesByRegion = salesByRegion;
		orderStatus = orderStatus;
		recentOrders = recentOrders;
	}

	onMount(async () => {
		try {
			await loadInitialData();

			// Subscribe to order_items changes
			pb.collection('order_items').subscribe('*', async function (e: any) {
				console.log('order_items event:', e.action);
				// Reload data when order_items change
				const orderItems = await pb.collection('order_items').getList(1, 500, { expand: 'product' });
				const products = await pb.collection('products').getList(1, 500);
				const customers = await pb.collection('customers').getList(1, 500);
				const orders = await pb.collection('orders').getList(1, 500);
				updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
			});

			// Subscribe to products changes
			pb.collection('products').subscribe('*', async function (e: any) {
				console.log('products event:', e.action);
				const orderItems = await pb.collection('order_items').getList(1, 500, { expand: 'product' });
				const products = await pb.collection('products').getList(1, 500);
				const customers = await pb.collection('customers').getList(1, 500);
				const orders = await pb.collection('orders').getList(1, 500);
				updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
			});

			// Subscribe to customers changes
			pb.collection('customers').subscribe('*', async function (e: any) {
				console.log('customers event:', e.action);
				const orderItems = await pb.collection('order_items').getList(1, 500, { expand: 'product' });
				const products = await pb.collection('products').getList(1, 500);
				const customers = await pb.collection('customers').getList(1, 500);
				const orders = await pb.collection('orders').getList(1, 500);
				updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
			});

			// Subscribe to orders changes
			pb.collection('orders').subscribe('*', async function (e: any) {
				console.log('orders event:', e.action);
				const orderItems = await pb.collection('order_items').getList(1, 500, { expand: 'product' });
				const products = await pb.collection('products').getList(1, 500);
				const customers = await pb.collection('customers').getList(1, 500);
				const orders = await pb.collection('orders').getList(1, 500);
				updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
			});
		} catch (error) {
			console.error('Error setting up real-time dashboard:', error);
		}
	});

	onDestroy(() => {
		// Clean up all subscriptions
		pb.collection('order_items').unsubscribe();
		pb.collection('products').unsubscribe();
		pb.collection('customers').unsubscribe();
		pb.collection('orders').unsubscribe();
	});

	// Handle date range change
	async function changeDateRange(range: string) {
		dateRange = range;
		showDatePicker = false;
		
		// Reload data with new filter
		try {
			const orderItems = await pb.collection('order_items').getList(1, 500, { expand: 'product' });
			const products = await pb.collection('products').getList(1, 500);
			const customers = await pb.collection('customers').getList(1, 500);
			const orders = await pb.collection('orders').getList(1, 500);
			updateAllMetrics(orderItems.items, products.items, customers.items, orders.items);
		} catch (error) {
			console.error('Error updating date range:', error);
		}
	}

</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200">
		<div class="px-6 py-3">
			<div class="flex justify-between items-start">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
					<p class="text-gray-400 text-xs mt-1">
						{#if dateRange === 'today'}
							Today • Real-time business performance and insights
						{:else if dateRange === 'last30'}
							Last 30 days • Real-time business performance and insights
						{:else if dateRange === 'all'}
							All time • Real-time business performance and insights
						{:else}
							{customStartDate} to {customEndDate} • Real-time business performance and insights
						{/if}
					</p>
				</div>
				<div class="flex gap-2 relative">
					<div class="relative">
						<button 
							on:click={() => showDatePicker = !showDatePicker}
							class="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 {dateRange === 'today' || dateRange === 'last30' ? 'bg-blue-50 border-blue-300' : ''}"
						>
							📅 {dateRange === 'today' ? 'Today' : dateRange === 'last30' ? 'Last 30 Days' : dateRange === 'all' ? 'All Time' : 'Custom'}
						</button>
						{#if showDatePicker}
							<div class="absolute right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-10 w-64">
								<div class="space-y-2">
									<button 
										on:click={() => changeDateRange('today')}
										class="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 rounded {dateRange === 'today' ? 'bg-blue-100 text-blue-700 font-semibold' : ''}"
									>
										Today
									</button>
									<button 
										on:click={() => changeDateRange('last30')}
										class="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 rounded {dateRange === 'last30' ? 'bg-blue-100 text-blue-700 font-semibold' : ''}"
									>
										Last 30 Days
									</button>
									<button 
										on:click={() => changeDateRange('all')}
										class="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 rounded {dateRange === 'all' ? 'bg-blue-100 text-blue-700 font-semibold' : ''}"
									>
										All Time
									</button>
									<div class="border-t pt-2">
										<p class="text-xs font-semibold text-gray-700 mb-2">Custom Range</p>
										<input 
											type="date" 
											bind:value={customStartDate}
											class="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2"
											placeholder="Start Date"
										/>
										<input 
											type="date" 
											bind:value={customEndDate}
											class="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2"
										/>
										<button 
											on:click={() => changeDateRange('custom')}
											class="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
										>
											Apply Custom Range
										</button>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="p-6 space-y-6">
		<!-- 1️⃣ Top KPI Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			{#each kpis as kpi}
				<div class="{kpi.color} rounded-lg border border-gray-200 p-4 flex flex-col">
					<div class="flex justify-between items-start flex-1">
						<div class="flex-1 min-w-0">
							<p class="text-gray-600 text-xs font-medium">{kpi.label}</p>
							<h3 class="text-xl lg:text-2xl font-bold text-gray-900 mt-1 break-words">{kpi.value}</h3>
							{#if kpi.subtext}
								<p class="text-gray-500 text-xs mt-1">{kpi.subtext}</p>
							{/if}
						</div>
						<div class="w-8 h-8 text-gray-700 flex-shrink-0 ml-2">
							{@html getIconSVG(kpi.icon)}
						</div>
					</div>
					{#if kpi.yesterdayValue !== undefined}
						<div class="border-t border-gray-300 mt-3 pt-3 space-y-2">
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-500">Yesterday</span>
								<span class="font-semibold text-gray-900">{kpi.yesterdayValue}</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-500">All Time</span>
								<span class="font-semibold text-gray-900">{kpi.allTimeValue}</span>
							</div>
							<div class="flex items-center justify-between pt-2 border-t border-gray-200">
								<span class="text-xs font-bold {kpi.isPositive ? 'text-green-600' : 'text-red-600'}">
									{kpi.isPositive ? '+' : ''}{kpi.percentChange}%
								</span>
								<svg class="w-4 h-4 {kpi.isPositive ? 'text-green-600' : 'text-red-600'}" fill="currentColor" viewBox="0 0 24 24">
									{#if kpi.isPositive}
										<path d="M7 14l5-5 5 5z"/>
									{:else}
										<path d="M7 10l5 5 5-5z"/>
									{/if}
								</svg>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- 2️⃣ Sales Performance Charts -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Product Mix Chart -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4 4h2v14h-2zm4-2h2v16h-2z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Product Mix</h3>
			</div>
			{#if productMix.length > 0}
				<div class="flex items-center justify-center h-40 relative">
					<svg class="w-32 h-32" viewBox="0 0 200 200">
						{#each productMix as product, i}
							{@const circumference = 502.65}
							{@const strokeDash = (product.value / 100) * circumference}
							{@const strokeOffset = productMix.slice(0, i).reduce((acc, p) => acc + (p.value / 100) * circumference, 0)}
							<circle 
								cx="100" 
								cy="100" 
								r="80" 
								fill="none" 
								stroke="{product.color}" 
								stroke-width="20" 
								stroke-dasharray="{strokeDash} {circumference}"
								stroke-dashoffset="{-strokeOffset}"
								class="cursor-pointer hover:stroke-[24px] transition-all"
								on:mouseenter={() => hoveredProductIndex = i}
								on:mouseleave={() => hoveredProductIndex = null}
								style="opacity: {hoveredProductIndex === null || hoveredProductIndex === i ? 1 : 0.6}"
							/>
						{/each}
					</svg>
					{#if hoveredProductIndex !== null && productMix[hoveredProductIndex]}
						<div class="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg z-10 text-xs text-center max-w-xs">
							<p class="font-semibold">{productMix[hoveredProductIndex].name}</p>
							<p>{productMix[hoveredProductIndex].value}%</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center h-40 text-gray-500">
					<p>No product data available</p>
				</div>
			{/if}
				<div class="mt-4 space-y-2 text-xs">
					{#each productMix as product}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-2 h-2 rounded-full" style="background-color: {product.color}"></div>
								<span class="text-gray-700">{product.name}</span>
							</div>
							<span class="font-semibold text-gray-900">{product.value}%</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Orders Over Time Chart -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4 4h2v14h-2zm4-2h2v16h-2z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Revenue Trend (Daily)</h3>
			</div>
			{#if ordersOverTime.length > 0}
				<div class="relative">
					<svg 
						viewBox="0 0 400 200" 
						class="w-full h-40 cursor-crosshair"
						on:mousemove={(e) => {
							const rect = e.currentTarget.getBoundingClientRect();
							const x = e.clientX - rect.left;
							const normalizedX = (x / rect.width) * 400;
							hoveredOrdersOverTimeX = normalizedX;
							const index = Math.round((normalizedX / 400) * (ordersOverTime.length - 1));
							hoveredOrdersOverTimeData = index >= 0 && index < ordersOverTime.length ? ordersOverTime[index] : null;
						}}
						on:mouseleave={() => {
							hoveredOrdersOverTimeX = null;
							hoveredOrdersOverTimeData = null;
						}}
					>
						<defs>
							<linearGradient id="ordersGradient" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" style="stop-color:#3B82F6;stop-opacity:0.2" />
								<stop offset="100%" style="stop-color:#3B82F6;stop-opacity:0" />
							</linearGradient>
						</defs>
						<!-- Dynamic chart with real data -->
						<path d={`M 0,150 ${ordersOverTime.map((p, i) => `${(i / (ordersOverTime.length - 1 || 1)) * 400},${maxOrderQuantity > 0 ? 150 - (p.revenue / maxOrderQuantity) * 120 : 150}`).join(' ')} L 400,150 Z`} fill="url(#ordersGradient)" />
						<path d={`M 0,150 ${ordersOverTime.map((p, i) => `${(i / (ordersOverTime.length - 1 || 1)) * 400},${maxOrderQuantity > 0 ? 150 - (p.revenue / maxOrderQuantity) * 120 : 150}`).join(' ')}`} stroke="#3B82F6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
						<!-- Hover line -->
						{#if hoveredOrdersOverTimeX !== null}
							<line x1="{hoveredOrdersOverTimeX}" y1="0" x2="{hoveredOrdersOverTimeX}" y2="200" stroke="#EF4444" stroke-width="1" stroke-dasharray="4,4" />
							<circle cx="{hoveredOrdersOverTimeX}" cy="{maxOrderQuantity > 0 && hoveredOrdersOverTimeData ? 150 - (hoveredOrdersOverTimeData.revenue / maxOrderQuantity) * 120 : 150}" r="4" fill="#EF4444" />
						{/if}
					</svg>
					{#if hoveredOrdersOverTimeData}
						<div class="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg z-10 text-xs top-0 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
							<p class="font-semibold">{hoveredOrdersOverTimeData.day}</p>
							<p>KES {hoveredOrdersOverTimeData.revenue.toLocaleString()}</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center h-40 text-gray-500">
					<p>No data available</p>
				</div>
			{/if}
				<div class="mt-3 flex gap-4 text-xs text-gray-600">
					<div>
						<p class="text-gray-500 text-xs">Peak Daily Revenue</p>
						<p class="font-semibold text-gray-900">KES {maxOrderQuantity.toLocaleString()}</p>
					</div>
					<div>
						<p class="text-gray-500 text-xs">Average Daily Revenue</p>
						<p class="font-semibold text-gray-900">KES {avgOrderQuantity.toLocaleString()}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- 3️⃣ Customer Performance Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Top 10 Customers -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Top 10 Customers</h3>
			</div>
				<div class="space-y-2 max-h-56 overflow-y-auto">
					{#each topCustomers as customer, i}
						{@const maxCustomerBales = topCustomers.length > 0 ? Math.max(...topCustomers.map(c => c.bales), 1) : 1}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2 flex-1">
								<span class="text-xs font-semibold text-gray-400 w-5">{i + 1}</span>
								<span class="text-xs text-gray-700">{customer.name}</span>
							</div>
							<div class="flex items-center gap-1">
								<div class="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
									<div class="h-full" style="width: {(customer.bales / maxCustomerBales) * 100}%; background-color: #3B82F6;"></div>
								</div>
								<span class="text-xs font-semibold text-gray-900 w-16 text-right">{formatLargeNumber(customer.bales)}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Top Products by Revenue -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM1 2v2h2l3.6 7.59-1.35 2.45c-.15.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Top Products by Revenue</h3>
			</div>
			{#if topProductsByRevenue.length > 0}
				<div class="space-y-3">
					{#each topProductsByRevenue as product, i}
						{@const barWidth = maxProductRevenue > 0 ? (product.revenue / maxProductRevenue) * 100 : 0}
						{@const showValueInside = barWidth > 30}
						<div class="flex items-center gap-3">
							<span class="text-xs text-gray-700 w-32 font-medium truncate" title={product.name}>{product.name}</span>
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<div class="relative flex-1 bg-gray-100 rounded-full overflow-hidden" style="height: 32px;">
									<div class="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-300" style="width: {barWidth}%; min-width: {barWidth > 0 ? '4px' : '0'}; background: linear-gradient(to right, {product.color}, {product.color}dd);">
										{#if showValueInside}
											<span class="text-xs font-semibold text-white whitespace-nowrap">KES {Math.round(product.revenue).toLocaleString()}</span>
										{/if}
									</div>
									{#if !showValueInside}
										<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-700">KES {Math.round(product.revenue).toLocaleString()}</span>
									{/if}
								</div>
							</div>
							<span class="text-xs font-semibold text-gray-900 w-20 text-right">KES {Math.round(product.revenue).toLocaleString()}</span>
						</div>
					{/each}
				</div>
				<div class="border-t border-gray-200 mt-4 pt-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-gray-900">Total Revenue</span>
						<span class="text-xs font-bold" style="color: #3B82F6;">KES {Math.round(topProductsByRevenue.reduce((sum, p) => sum + p.revenue, 0)).toLocaleString()}</span>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center h-40 text-gray-500">
					<p>No product revenue data available</p>
				</div>
			{/if}
			</div>
		</div>

		<!-- 4️⃣ Regional Performance Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Sales by Region -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4 4h2v14h-2zm4-2h2v16h-2z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Sales by Region</h3>
			</div>
				<div class="space-y-3">
					{#each salesByRegion as region}
						{@const maxBales = salesByRegion.length > 0 ? Math.max(...salesByRegion.map(r => r.bales), 1) : 1}
						{@const barWidth = (region.bales / maxBales) * 100}
						{@const showValueInside = barWidth > 20}
						<div class="flex items-center gap-3">
							<span class="text-xs text-gray-700 w-20 font-medium truncate">{region.region}</span>
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<div class="relative flex-1 bg-gray-100 rounded-full overflow-hidden" style="height: 32px;">
									<div class="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-300" style="width: {barWidth}%; min-width: {barWidth > 0 ? '4px' : '0'}; background: linear-gradient(to right, #60A5FA, #3B82F6);">
										{#if showValueInside}
											<span class="text-xs font-semibold text-white whitespace-nowrap px-1">{formatLargeNumber(region.bales)}</span>
										{/if}
									</div>
									{#if !showValueInside}
										<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-700">{formatLargeNumber(region.bales)}</span>
									{/if}
								</div>
							</div>
							<span class="text-xs font-semibold text-gray-900 w-20 text-right">{formatLargeNumber(region.bales)}</span>
						</div>
					{/each}
				</div>
				<div class="border-t border-gray-200 mt-4 pt-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-gray-900">Total</span>
						<span class="text-xs font-bold" style="color: #3B82F6;">{formatLargeNumber(salesByRegion.reduce((sum, r) => sum + r.bales, 0))}</span>
					</div>
				</div>
			</div>

			<!-- Order Status Distribution -->
			<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Order Status Distribution</h3>
			</div>
			{#if orderStatus.some(s => s.count > 0)}
				<div class="flex items-center justify-center h-32 relative">
					<svg class="w-24 h-24" viewBox="0 0 160 160">
						{#each orderStatus as status, i}
							{@const circumference = 188.4}
							{@const strokeDash = (status.percentage / 100) * circumference}
							{@const strokeOffset = orderStatus.slice(0, i).reduce((acc, s) => acc + (s.percentage / 100) * circumference, 0)}
							<circle 
								cx="80" 
								cy="80" 
								r="60" 
								fill="none" 
								stroke="{status.color}" 
								stroke-width="15" 
								stroke-dasharray="{strokeDash} {circumference}"
								stroke-dashoffset="{-strokeOffset}"
								class="cursor-pointer hover:stroke-[19px] transition-all"
								on:mouseenter={() => hoveredStatusIndex = i}
								on:mouseleave={() => hoveredStatusIndex = null}
								style="opacity: {hoveredStatusIndex === null || hoveredStatusIndex === i ? 1 : 0.6}"
							/>
						{/each}
					</svg>
					{#if hoveredStatusIndex !== null && orderStatus[hoveredStatusIndex]}
						<div class="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg z-10 text-xs text-center max-w-xs">
							<p class="font-semibold">{orderStatus[hoveredStatusIndex].status}</p>
							<p>{orderStatus[hoveredStatusIndex].count} orders ({orderStatus[hoveredStatusIndex].percentage}%)</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center h-32 text-gray-500">
					<p>No status data available</p>
				</div>
			{/if}
				<div class="mt-3 space-y-2 text-xs">
					{#each orderStatus as status}
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-2 h-2 rounded-full" style="background-color: {status.color}"></div>
								<span class="text-gray-700">{status.status} ({status.count})</span>
							</div>
							<span class="font-semibold text-gray-900">{status.percentage}%</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- 5️⃣ Recent Orders Table -->
		<div class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex items-center gap-2 mb-4">
				<svg class="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/></svg>
				<h3 class="text-sm font-semibold text-gray-900">Recent Orders</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-xs">
					<thead>
						<tr class="border-b border-gray-200">
							<th class="text-left py-2 px-2 text-gray-700 font-semibold">Date</th>
							<th class="text-left py-2 px-2 text-gray-700 font-semibold">Customer</th>
							<th class="text-left py-2 px-2 text-gray-700 font-semibold">Region</th>
							<th class="text-left py-2 px-2 text-gray-700 font-semibold">Product Items</th>
							<th class="text-left py-2 px-2 text-gray-700 font-semibold">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each recentOrders as order}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="py-2 px-2 text-gray-900">{order.date}</td>
								<td class="py-2 px-2 text-gray-900 font-medium">{order.customer}</td>
								<td class="py-2 px-2 text-gray-600">{order.region}</td>
								<td class="py-2 px-2 text-gray-600 text-xs">{order.items}</td>
								<td class="py-2 px-2">
									<span class="px-2 py-0.5 rounded text-xs font-semibold {order.statusColor}">
										{order.status}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</main>
</div>
