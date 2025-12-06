<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import pb from "$lib/pocketbase";

	// State
	let orders: any[] = [];
	let customers: any[] = [];
	let products: any[] = [];
	let orderItems: any[] = [];
	let filteredOrders: any[] = [];
	let loading = false;
	let loadingMore = false;
	let hasMore = true;
	let currentPage = 1;
	const pageSize = 7;
	let searchQuery = "";
	let filterStatus = "all"; // 'all', 'Pending', 'Processed', 'Dispatched'
	let sortBy = "created"; // 'created', 'customer', 'status'
	let sortOrder = "desc"; // 'asc', 'desc'

	// Modal States
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteConfirm = false;
	let showDetailCard = false;
	let selectedOrder: any = null;
	let selectedOrderDetails: any = null;

	// Notification States
	let showNotification = false;
	let notificationMessage = "";
	let notificationType = "success"; // 'success', 'error', 'info'

	// Form Data
	let formData = {
		customer: "",
		status: "Pending",
		comments: "",
		invoice_amount: 0,
		items: [] as Array<{ product: string; quantity: number }>,
	};

	// Customer Search State
	let customerSearchQuery = "";
	let filteredCustomers: any[] = [];
	let showCustomerDropdown = false;
	let selectedCustomerIndex = -1;

	// Load initial data
	async function loadOrders() {
		loading = true;
		currentPage = 1;
		hasMore = true;
		try {
			const ordersData = await pb.collection("orders").getList(1, pageSize, {
				expand: "customer",
				sort: "-created",
			});
			orders = ordersData.items;
			hasMore = ordersData.page < ordersData.totalPages;

			const customersData = await pb
				.collection("customers")
				.getList(1, 500);
			customers = customersData.items;

			const productsData = await pb
				.collection("products")
				.getList(1, 500);
			products = productsData.items;

			// Load order items for analytics
			const orderItemsData = await pb.collection("order_items").getList(1, 500, {
				expand: "product",
			});
			orderItems = orderItemsData.items;

			filterAndSortOrders();
		} catch (error) {
			console.error("Error loading orders:", error);
		} finally {
			loading = false;
		}
	}

	// Load more orders
	async function loadMoreOrders() {
		if (loadingMore || !hasMore) return;
		
		loadingMore = true;
		try {
			const nextPage = currentPage + 1;
			const ordersData = await pb.collection("orders").getList(nextPage, pageSize, {
				expand: "customer",
				sort: "-created",
			});
			
			orders = [...orders, ...ordersData.items];
			currentPage = nextPage;
			hasMore = ordersData.page < ordersData.totalPages;
			
			filterAndSortOrders();
		} catch (error) {
			console.error("Error loading more orders:", error);
		} finally {
			loadingMore = false;
		}
	}

	// Filter and sort orders
	function filterAndSortOrders() {
		let result = [...orders];

		// Filter by status
		if (filterStatus !== "all") {
			result = result.filter((o) => o.status === filterStatus);
		}

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter((o) => {
				const customerName =
					o.expand?.customer?.name?.toLowerCase() || "";
				const comments = o.comments?.toLowerCase() || "";
				const id = o.id?.toLowerCase() || "";
				return (
					customerName.includes(query) ||
					comments.includes(query) ||
					id.includes(query)
				);
			});
		}

		// Sort
		result.sort((a, b) => {
			let aVal: any;
			let bVal: any;

			if (sortBy === "created") {
				aVal = new Date(a.created).getTime();
				bVal = new Date(b.created).getTime();
			} else if (sortBy === "customer") {
				aVal = a.expand?.customer?.name || "";
				bVal = b.expand?.customer?.name || "";
			} else if (sortBy === "status") {
				aVal = a.status || "";
				bVal = b.status || "";
			}

			if (sortOrder === "asc") {
				return aVal > bVal ? 1 : -1;
			} else {
				return aVal < bVal ? 1 : -1;
			}
		});

		filteredOrders = result;
	}

	// Create order
	async function createOrder() {
		if (!formData.customer) {
			alert("Please select a customer");
			return;
		}

		if (formData.invoice_amount <= 0) {
			alert("Please enter a valid invoice amount");
			return;
		}

		if (formData.items.length === 0) {
			alert("Please add at least one item to the order");
			return;
		}

		try {
			loading = true;
			const newOrder = await pb.collection("orders").create({
				customer: formData.customer,
				status: formData.status,
				comments: formData.comments,
				invoice_amount: formData.invoice_amount,
			});

			// Create order items
			for (const item of formData.items) {
				if (item.product && item.quantity > 0) {
					await pb.collection("order_items").create({
						order: newOrder.id,
						product: item.product,
						quantity: item.quantity,
					});
				}
			}

			// Show success notification
			showNotificationMessage("Order placed successfully!", "success");

			// Redirect to orders page after a short delay
			setTimeout(async () => {
				await goto("/analytics/orders");
			}, 1500);
		} catch (error) {
			console.error("Error creating order:", error);
			alert("Failed to create order");
		} finally {
			loading = false;
		}
	}

	// Update order
	async function updateOrder() {
		if (!selectedOrder) return;

		try {
			loading = true;
			await pb.collection("orders").update(selectedOrder.id, {
				customer: formData.customer,
				status: formData.status,
				comments: formData.comments,
				invoice_amount: formData.invoice_amount,
			});

			// Update in list
			const updatedOrder = await pb
				.collection("orders")
				.getOne(selectedOrder.id, {
					expand: "customer",
				});

			const index = orders.findIndex((o) => o.id === selectedOrder.id);
			if (index !== -1) {
				orders[index] = updatedOrder;
			}

			filterAndSortOrders();
			closeEditModal();
		} catch (error) {
			console.error("Error updating order:", error);
			alert("Failed to update order");
		} finally {
			loading = false;
		}
	}

	// Delete order
	async function deleteOrder() {
		if (!selectedOrder) return;

		try {
			loading = true;
			await pb.collection("orders").delete(selectedOrder.id);

			orders = orders.filter((o) => o.id !== selectedOrder.id);
			filterAndSortOrders();
			closeDeleteConfirm();
		} catch (error) {
			console.error("Error deleting order:", error);
			alert("Failed to delete order");
		} finally {
			loading = false;
		}
	}

	// Modal handlers
	function openCreateModal() {
		formData = {
			customer: "",
			status: "Pending",
			comments: "",
			invoice_amount: 0,
			items: [{ product: "", quantity: 1 }],
		};
		customerSearchQuery = "";
		showCreateModal = true;
		document.body.classList.add("modal-open");
	}

	// Customer Search Functions
	function filterCustomers() {
		const query = customerSearchQuery.toLowerCase().trim();
		if (query.length >= 1) {
			filteredCustomers = customers.filter((customer) =>
				customer.name.toLowerCase().includes(query),
			);
			showCustomerDropdown = filteredCustomers.length > 0;
			selectedCustomerIndex = -1;
		} else {
			filteredCustomers = [];
			showCustomerDropdown = false;
			selectedCustomerIndex = -1;
		}
	}

	function selectCustomer(customer: any) {
		formData.customer = customer.id;
		customerSearchQuery = customer.name;
		showCustomerDropdown = false;
		selectedCustomerIndex = -1;
	}

	function handleCustomerKeydown(event: KeyboardEvent) {
		if (!showCustomerDropdown) return;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			selectedCustomerIndex = Math.min(
				selectedCustomerIndex + 1,
				filteredCustomers.length - 1,
			);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			selectedCustomerIndex = Math.max(selectedCustomerIndex - 1, 0);
		} else if (event.key === "Enter" && selectedCustomerIndex >= 0) {
			event.preventDefault();
			selectCustomer(filteredCustomers[selectedCustomerIndex]);
		} else if (event.key === "Escape") {
			showCustomerDropdown = false;
			selectedCustomerIndex = -1;
		}
	}

	function clearCustomerSearch() {
		customerSearchQuery = "";
		formData.customer = "";
		filteredCustomers = [];
		showCustomerDropdown = false;
		selectedCustomerIndex = -1;
	}

	function closeCreateModal() {
		showCreateModal = false;
		formData = {
			customer: "",
			status: "Pending",
			comments: "",
			invoice_amount: 0,
			items: [],
		};
		document.body.classList.remove("modal-open");
	}

	function openEditModal(order: any) {
		selectedOrder = order;
		formData = {
			customer: order.customer,
			status: order.status,
			comments: order.comments,
			invoice_amount: order.invoice_amount || 0,
			items: [],
		};
		// Initialize search query with customer name
		const customer = customers.find((c) => c.id === order.customer);
		customerSearchQuery = customer ? customer.name : "";

		showEditModal = true;
		document.body.classList.add("modal-open");
	}

	function closeEditModal() {
		showEditModal = false;
		selectedOrder = null;
		formData = {
			customer: "",
			status: "Pending",
			comments: "",
			invoice_amount: 0,
			items: [],
		};
		document.body.classList.remove("modal-open");
	}

	function openDeleteConfirm(order: any) {
		selectedOrder = order;
		showDeleteConfirm = true;
		document.body.classList.add("modal-open");
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
		selectedOrder = null;
		document.body.classList.remove("modal-open");
	}

	// View order details
	async function viewOrderDetails(order: any) {
		try {
			// Load order items with product details
			const items = await pb.collection("order_items").getList(1, 500, {
				filter: `order = "${order.id}"`,
				expand: "product",
			});
			selectedOrder = order;
			selectedOrderDetails = items.items;
			showDetailCard = true;
			document.body.classList.add("modal-open");
		} catch (error) {
			console.error("Error loading order details:", error);
		}
	}

	function closeDetailCard() {
		showDetailCard = false;
		selectedOrder = null;
		selectedOrderDetails = null;
		document.body.classList.remove("modal-open");
	}

	// Add item to form
	function addItem() {
		formData.items = [...formData.items, { product: "", quantity: 1 }];
	}

	// Remove item from form
	function removeItem(index: number) {
		formData.items = formData.items.filter((_, i) => i !== index);
	}

	// Get product name by ID
	function getProductName(productId: string): string {
		return (
			products.find((p) => p.id === productId)?.name || "Unknown Product"
		);
	}

	// Get customer name by ID
	function getCustomerName(customerId: string): string {
		return customers.find((c) => c.id === customerId)?.name || "Unknown";
	}

	// Get status color
	function getStatusColor(status: string): string {
		switch (status) {
			case "Processed":
				return "bg-green-100 text-green-800";
			case "Dispatched":
				return "bg-blue-100 text-blue-800";
			case "Pending":
				return "bg-yellow-100 text-yellow-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	}

	// Show notification
	function showNotificationMessage(
		message: string,
		type: string = "success",
	) {
		notificationMessage = message;
		notificationType = type;
		showNotification = true;

		// Auto-hide notification after 3 seconds
		setTimeout(() => {
			showNotification = false;
		}, 3000);
	}

	// Format date
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	// Load all orders for analytics (separate from pagination)
	let allOrdersForAnalytics: any[] = [];
	async function loadAllOrdersForAnalytics() {
		try {
			const allOrdersData = await pb.collection("orders").getList(1, 500, {
				expand: "customer",
				sort: "-created",
			});
			allOrdersForAnalytics = allOrdersData.items;
			
			// If there are more pages, load them
			if (allOrdersData.totalPages > 1) {
				for (let page = 2; page <= allOrdersData.totalPages; page++) {
					const pageData = await pb.collection("orders").getList(page, 500, {
						expand: "customer",
						sort: "-created",
					});
					allOrdersForAnalytics = [...allOrdersForAnalytics, ...pageData.items];
				}
			}
		} catch (error) {
			console.error("Error loading all orders for analytics:", error);
		}
	}

	// Real-time subscriptions
	onMount(async () => {
		await loadOrders();
		await loadAllOrdersForAnalytics();

		// Subscribe to orders changes
		pb.collection("orders").subscribe("*", async (e: any) => {
			console.log("Order changed:", e.action);
			await loadOrders();
			await loadAllOrdersForAnalytics();
		});

		// Subscribe to customers changes
		pb.collection("customers").subscribe("*", async (e: any) => {
			console.log("Customer changed:", e.action);
			const customersData = await pb
				.collection("customers")
				.getList(1, 500);
			customers = customersData.items;
			filterAndSortOrders();
		});

		// Subscribe to products changes
		pb.collection("products").subscribe("*", async (e: any) => {
			console.log("Product changed:", e.action);
			const productsData = await pb
				.collection("products")
				.getList(1, 500);
			products = productsData.items;
		});

		// Subscribe to order items changes
		pb.collection("order_items").subscribe("*", async (e: any) => {
			console.log("Order item changed:", e.action);
			// Reload order items for analytics
			const orderItemsData = await pb.collection("order_items").getList(1, 500, {
				expand: "product",
			});
			orderItems = orderItemsData.items;
			
			if (selectedOrder) {
				await viewOrderDetails(selectedOrder);
			}
		});
	});

	onDestroy(() => {
		pb.collection("orders").unsubscribe();
		pb.collection("customers").unsubscribe();
		pb.collection("products").unsubscribe();
		pb.collection("order_items").unsubscribe();
	});

	// Update filtered orders when search/filter changes
	$: if (searchQuery || filterStatus || sortBy || sortOrder) {
		filterAndSortOrders();
	}

	// Color scheme matching main dashboard
	const STATUS_COLORS = {
		Processed: '#10B981',    // Green
		Dispatched: '#3B82F6',    // Blue
		Pending: '#F59E0B'        // Orange/Yellow
	};
	
	const CHART_COLORS = [
		'#3B82F6',  // Blue
		'#059669',  // Emerald Green
		'#EA580C',  // Bright Orange
		'#DC2626',  // Red
		'#7C3AED',  // Violet/Purple
		'#0891B2'   // Cyan/Teal
	];

	// Analytics Insights State
	let showAnalytics = false;
	let analyticsData = {
		totalOrders: 0,
		ordersByStatus: { Pending: 0, Processed: 0, Dispatched: 0 },
		topCustomersByOrders: [] as Array<{ name: string; orderCount: number; avgItemsPerOrder: number }>,
		ordersOverTime: [] as Array<{ date: string; count: number }>,
		ordersByRegion: [] as Array<{ region: string; orderCount: number; percentage: number }>,
		averageProcessingTime: 0,
		pendingOrdersAging: [] as Array<{ orderId: string; customerName: string; daysPending: number; itemCount: number }>,
		bestSellingProducts: [] as Array<{ name: string; quantity: number; orderCount: number }>,
		growthRate: 0,
		monthlyTrend: [] as Array<{ month: string; orders: number }>,
		ordersByDayOfWeek: [] as Array<{ day: string; count: number }>,
		ordersByHour: [] as Array<{ hour: string; count: number }>,
		orderSizeDistribution: [] as Array<{ size: string; count: number; percentage: number }>,
		statusTransitionRate: { toProcessed: 0, toDispatched: 0, avgTimeToProcessed: 0, avgTimeToDispatched: 0 },
		customerOrderFrequency: [] as Array<{ frequency: string; customerCount: number }>,
		repeatCustomers: 0,
		newCustomers: 0
	};

	// Calculate analytics insights
	function calculateAnalytics() {
		const ordersToAnalyze = allOrdersForAnalytics.length > 0 ? allOrdersForAnalytics : orders;
		if (ordersToAnalyze.length === 0) return;

		// Total Orders
		analyticsData.totalOrders = ordersToAnalyze.length;

		// Orders by Status
		analyticsData.ordersByStatus = { Pending: 0, Processed: 0, Dispatched: 0 };
		
		ordersToAnalyze.forEach(order => {
			const status = (order.status || 'Pending') as 'Pending' | 'Processed' | 'Dispatched';
			if (status in analyticsData.ordersByStatus) {
				analyticsData.ordersByStatus[status]++;
			}
		});

		// Top Customers by Order Count with average items per order
		const customerData = new Map<string, { name: string; orderCount: number; totalItems: number }>();
		ordersToAnalyze.forEach(order => {
			const customerName = order.expand?.customer?.name || getCustomerName(order.customer) || 'Unknown';
			const orderItemsCount = orderItems.filter(oi => oi.order === order.id).reduce((sum, oi) => sum + oi.quantity, 0);
			const existing = customerData.get(order.customer);
			if (existing) {
				existing.orderCount++;
				existing.totalItems += orderItemsCount;
			} else {
				customerData.set(order.customer, {
					name: customerName,
					orderCount: 1,
					totalItems: orderItemsCount
				});
			}
		});
		analyticsData.topCustomersByOrders = Array.from(customerData.values())
			.map(c => ({
				name: c.name,
				orderCount: c.orderCount,
				avgItemsPerOrder: c.totalItems / c.orderCount
			}))
			.sort((a, b) => b.orderCount - a.orderCount)
			.slice(0, 5);

		// Orders Over Time (Last 30 days)
		const last30Days = Array.from({ length: 30 }, (_, i) => {
			const date = new Date();
			date.setDate(date.getDate() - (29 - i));
			date.setHours(0, 0, 0, 0);
			return date.toISOString().split('T')[0];
		});

		analyticsData.ordersOverTime = last30Days.map(date => {
			const dayOrders = ordersToAnalyze.filter(o => {
				const orderDate = new Date(o.created).toISOString().split('T')[0];
				return orderDate === date;
			});
			return {
				date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				count: dayOrders.length
			};
		});

		// Orders by Region
		const regionData = new Map<string, number>();
		ordersToAnalyze.forEach(order => {
			const region = order.expand?.customer?.region || 'Unknown';
			regionData.set(region, (regionData.get(region) || 0) + 1);
		});
		const totalForPercentage = ordersToAnalyze.length || 1;
		analyticsData.ordersByRegion = Array.from(regionData.entries())
			.map(([region, orderCount]) => ({
				region,
				orderCount,
				percentage: (orderCount / totalForPercentage) * 100
			}))
			.sort((a, b) => b.orderCount - a.orderCount);

		// Average Processing Time (time from created to updated for Processed/Dispatched)
		const processedOrders = ordersToAnalyze.filter(o => o.status === 'Processed' || o.status === 'Dispatched');
		if (processedOrders.length > 0) {
			const totalTime = processedOrders.reduce((sum, o) => {
				const created = new Date(o.created).getTime();
				const updated = new Date(o.updated).getTime();
				return sum + (updated - created);
			}, 0);
			analyticsData.averageProcessingTime = totalTime / processedOrders.length / (1000 * 60 * 60); // Convert to hours
		}

		// Pending Orders Aging
		const now = new Date();
		analyticsData.pendingOrdersAging = ordersToAnalyze
			.filter(o => o.status === 'Pending')
			.map(order => {
				const created = new Date(order.created);
				const daysPending = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
				const itemCount = orderItems.filter(oi => oi.order === order.id).reduce((sum, oi) => sum + oi.quantity, 0);
				return {
					orderId: order.id.substring(0, 8),
					customerName: order.expand?.customer?.name || getCustomerName(order.customer) || 'Unknown',
					daysPending,
					itemCount
				};
			})
			.sort((a, b) => b.daysPending - a.daysPending)
			.slice(0, 10);

		// Best Selling Products (from order items)
		if (orderItems.length > 0) {
			const productSales = new Map<string, { name: string; quantity: number; orderCount: number }>();
			orderItems.forEach(item => {
				const order = ordersToAnalyze.find(o => o.id === item.order);
				if (order) {
					const productName = item.expand?.product?.name || getProductName(item.product);
					const existing = productSales.get(item.product);
					if (existing) {
						existing.quantity += item.quantity;
					} else {
						productSales.set(item.product, {
							name: productName,
							quantity: item.quantity,
							orderCount: 0
						});
					}
				}
			});
			// Count unique orders for each product
			productSales.forEach((product, productId) => {
				const uniqueOrders = new Set(
					orderItems
						.filter(oi => oi.product === productId && ordersToAnalyze.find(o => o.id === oi.order))
						.map(oi => oi.order)
				);
				product.orderCount = uniqueOrders.size;
			});
			analyticsData.bestSellingProducts = Array.from(productSales.values())
				.sort((a, b) => b.quantity - a.quantity)
				.slice(0, 5);
		}

		// Growth Rate (comparing last 15 days to previous 15 days)
		const nowDate = new Date();
		const last15DaysStart = new Date(nowDate);
		last15DaysStart.setDate(nowDate.getDate() - 15);
		const prev15DaysStart = new Date(nowDate);
		prev15DaysStart.setDate(nowDate.getDate() - 30);

		const last15DaysOrders = ordersToAnalyze.filter(o => {
			const orderDate = new Date(o.created);
			return orderDate >= last15DaysStart && orderDate < nowDate;
		});
		const prev15DaysOrders = ordersToAnalyze.filter(o => {
			const orderDate = new Date(o.created);
			return orderDate >= prev15DaysStart && orderDate < last15DaysStart;
		});

		analyticsData.growthRate = prev15DaysOrders.length > 0 
			? ((last15DaysOrders.length - prev15DaysOrders.length) / prev15DaysOrders.length) * 100 
			: (last15DaysOrders.length > 0 ? 100 : 0);

		// Monthly Trend (Last 3 months)
		const months = Array.from({ length: 3 }, (_, i) => {
			const date = new Date();
			date.setMonth(date.getMonth() - (2 - i));
			return date.toISOString().slice(0, 7); // YYYY-MM format
		});

		analyticsData.monthlyTrend = months.map(month => {
			const monthOrders = ordersToAnalyze.filter(o => {
				const orderMonth = o.created.slice(0, 7);
				return orderMonth === month;
			});
			return {
				month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
				orders: monthOrders.length
			};
		});
	}

	// Recalculate analytics when orders or allOrdersForAnalytics change
	$: if (allOrdersForAnalytics.length > 0 || orders.length > 0) {
		calculateAnalytics();
	}
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200">
		<div class="px-6 py-4">
			<div class="flex justify-between items-center">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">
						Orders Management
					</h1>
					<p class="text-gray-400 text-xs mt-1">
						Manage all orders with real-time updates
					</p>
				</div>
				<button
					on:click={openCreateModal}
					class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
				>
					+ Create New Order
				</button>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="p-6 space-y-6">
		<!-- Analytics Insights Section -->
		{#if showAnalytics}
			<div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
				<!-- Analytics Header -->
				<div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center">
					<div class="flex items-center gap-3">
						<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
						</svg>
						<h2 class="text-xl font-bold text-white">Orders Analytics & Insights</h2>
					</div>
					<button
						on:click={() => showAnalytics = false}
						class="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1 transition-colors"
						title="Collapse analytics"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
						</svg>
					</button>
				</div>

				<div class="p-6 space-y-6">
					<!-- Key Metrics Cards -->
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						<!-- Total Orders -->
						<div class="bg-blue-50 border border-blue-200 rounded-lg p-5 shadow-sm">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs font-semibold text-blue-700 uppercase tracking-wide">Total Orders</p>
									<p class="text-3xl font-bold text-blue-900 mt-2">{analyticsData.totalOrders.toLocaleString()}</p>
								</div>
								<svg class="w-10 h-10 text-blue-600 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
								</svg>
							</div>
						</div>

						<!-- Pending Orders -->
						<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-5 shadow-sm">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Pending</p>
									<p class="text-3xl font-bold text-yellow-900 mt-2">{analyticsData.ordersByStatus.Pending}</p>
									<p class="text-xs text-yellow-600 mt-1">{analyticsData.totalOrders > 0 ? ((analyticsData.ordersByStatus.Pending / analyticsData.totalOrders) * 100).toFixed(1) : 0}% of total</p>
								</div>
								<svg class="w-10 h-10 text-yellow-600 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
							</div>
						</div>

						<!-- Processed Orders -->
						<div class="bg-green-50 border border-green-200 rounded-lg p-5 shadow-sm">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-xs font-semibold text-green-700 uppercase tracking-wide">Processed</p>
									<p class="text-3xl font-bold text-green-900 mt-2">{analyticsData.ordersByStatus.Processed}</p>
									<p class="text-xs text-green-600 mt-1">{analyticsData.totalOrders > 0 ? ((analyticsData.ordersByStatus.Processed / analyticsData.totalOrders) * 100).toFixed(1) : 0}% of total</p>
								</div>
								<svg class="w-10 h-10 text-green-600 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
							</div>
						</div>
					</div>

					<!-- Main Performance Charts -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Orders Over Time (Last 30 Days) -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
								</svg>
								Orders Trend (Last 30 Days)
							</h3>
							{#if analyticsData.ordersOverTime.length > 0}
								{@const maxCount = Math.max(...analyticsData.ordersOverTime.map(d => d.count), 1)}
								{@const chartHeight = 180}
								{@const paddingTop = 10}
								{@const paddingBottom = 10}
								{@const paddingLeft = 0}
								{@const paddingRight = 0}
								
								{@const points = analyticsData.ordersOverTime.map((d, i) => {
									const x = paddingLeft + (i / (analyticsData.ordersOverTime.length - 1 || 1)) * (100 - paddingLeft - paddingRight);
									const y = chartHeight - paddingBottom - (d.count / maxCount) * (chartHeight - paddingTop - paddingBottom);
									return { x, y };
								})}
								
								{@const linePath = points.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(' ')}
								
								{@const areaPath = (() => {
									const firstPoint = points[0];
									const lastPoint = points[points.length - 1];
									const bottomY = chartHeight - paddingBottom;
									return `${linePath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`;
								})()}
								
								<div class="relative">
									<svg class="w-full" viewBox="0 0 100 {chartHeight}" preserveAspectRatio="none" style="height: {chartHeight}px;">
										<!-- Area fill (semi-transparent blue) -->
										<path
											d={areaPath}
											fill={CHART_COLORS[0]}
											fill-opacity="0.2"
										/>
										
										<!-- Line path (thin blue line) -->
										<path
											d={linePath}
											fill="none"
											stroke={CHART_COLORS[0]}
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									
									<!-- X-axis labels -->
									<div class="flex justify-between text-xs text-gray-500 mt-2">
										<span>{analyticsData.ordersOverTime[0]?.date}</span>
										<span>{analyticsData.ordersOverTime[analyticsData.ordersOverTime.length - 1]?.date}</span>
									</div>
								</div>
							{:else}
								<p class="text-gray-500 text-center py-12">No data available</p>
							{/if}
						</div>

						<!-- Order Status Distribution -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
								</svg>
								Orders by Status
							</h3>
							<div class="space-y-4">
								{#each Object.entries(analyticsData.ordersByStatus) as [status, count]}
									{@const total = analyticsData.totalOrders || 1}
									{@const percentage = (count / total) * 100}
									{@const statusKey = status as 'Pending' | 'Processed' | 'Dispatched'}
									{@const statusColor = STATUS_COLORS[statusKey]}
									<div>
										<div class="flex justify-between items-center mb-2">
											<span class="text-sm font-semibold text-gray-700">{status}</span>
											<span class="text-sm font-bold text-gray-900">{count} orders</span>
										</div>
										<div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
											<div
												class="h-full rounded-full transition-all duration-300"
												style="width: {percentage}%; background-color: {statusColor}"
											></div>
										</div>
										<p class="text-xs text-gray-500 mt-1.5">{percentage.toFixed(1)}% of total orders</p>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Business Insights -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Top Customers by Orders -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
								</svg>
								Top Customers by Orders
							</h3>
							{#if analyticsData.topCustomersByOrders.length > 0}
								{@const maxOrders = Math.max(...analyticsData.topCustomersByOrders.map(c => c.orderCount), 1)}
								<div class="space-y-4">
									{#each analyticsData.topCustomersByOrders as customer, index}
										{@const percentage = (customer.orderCount / maxOrders) * 100}
										<div>
											<div class="flex justify-between items-center mb-2">
												<div class="flex items-center gap-2 flex-1 min-w-0">
													<span class="text-xs font-bold text-gray-500 w-6 flex-shrink-0">#{index + 1}</span>
													<span class="text-sm font-semibold text-gray-900 truncate">{customer.name}</span>
												</div>
												<span class="text-sm font-bold text-gray-900 ml-2">{customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'}</span>
											</div>
											<div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
												<div
													class="h-full rounded-full transition-all duration-300"
													style="width: {percentage}%; background-color: {CHART_COLORS[0]}"
												></div>
											</div>
											<p class="text-xs text-gray-500 mt-1.5">Avg {customer.avgItemsPerOrder.toFixed(1)} items per order</p>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-gray-500 text-center py-12">No customer data available</p>
							{/if}
						</div>

						<!-- Best Selling Products -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
								</svg>
								Best Selling Products
							</h3>
							{#if analyticsData.bestSellingProducts.length > 0}
								{@const maxQuantity = Math.max(...analyticsData.bestSellingProducts.map(p => p.quantity), 1)}
								<div class="space-y-4">
									{#each analyticsData.bestSellingProducts as product, index}
										{@const percentage = (product.quantity / maxQuantity) * 100}
										<div>
											<div class="flex justify-between items-center mb-2">
												<div class="flex items-center gap-2 flex-1 min-w-0">
													<span class="text-xs font-bold text-gray-500 w-6 flex-shrink-0">#{index + 1}</span>
													<span class="text-sm font-semibold text-gray-900 truncate">{product.name}</span>
												</div>
												<span class="text-sm font-bold text-gray-900 ml-2">{product.quantity} units</span>
											</div>
											<div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
												<div
													class="h-full rounded-full transition-all duration-300"
													style="width: {percentage}%; background-color: {CHART_COLORS[3]}"
												></div>
											</div>
											<p class="text-xs text-gray-500 mt-1.5">In {product.orderCount} {product.orderCount === 1 ? 'order' : 'orders'}</p>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-gray-500 text-center py-12">No product data available</p>
							{/if}
						</div>
					</div>

					<!-- Geographic & Temporal Analysis -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<!-- Orders by Region -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								Orders by Region
							</h3>
							{#if analyticsData.ordersByRegion.length > 0}
								{@const maxOrders = Math.max(...analyticsData.ordersByRegion.map(r => r.orderCount), 1)}
								<div class="space-y-4">
									{#each analyticsData.ordersByRegion.slice(0, 5) as region}
										{@const percentage = (region.orderCount / maxOrders) * 100}
										<div>
											<div class="flex justify-between items-center mb-2">
												<span class="text-sm font-semibold text-gray-900">{region.region}</span>
												<span class="text-sm font-bold text-gray-900">{region.orderCount} {region.orderCount === 1 ? 'order' : 'orders'}</span>
											</div>
											<div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
												<div
													class="h-full rounded-full transition-all duration-300"
													style="width: {percentage}%; background-color: {CHART_COLORS[1]}"
												></div>
											</div>
											<p class="text-xs text-gray-500 mt-1.5">{region.percentage.toFixed(1)}% of total orders</p>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-gray-500 text-center py-12">No regional data available</p>
							{/if}
						</div>

						<!-- Monthly Trend -->
						<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
							<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
								<svg class="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
								</svg>
								Monthly Trend (Last 3 Months)
							</h3>
							{#if analyticsData.monthlyTrend.length > 0}
								{@const maxOrders = Math.max(...analyticsData.monthlyTrend.map(m => m.orders), 1)}
								<div class="space-y-4">
									{#each analyticsData.monthlyTrend as month, index}
										{@const percentage = (month.orders / maxOrders) * 100}
										<div>
											<div class="flex justify-between items-center mb-2">
												<span class="text-sm font-semibold text-gray-900">{month.month}</span>
												<span class="text-sm font-bold text-gray-900">{month.orders} {month.orders === 1 ? 'order' : 'orders'}</span>
											</div>
											<div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
												<div
													class="h-full rounded-full transition-all duration-300"
													style="width: {percentage}%; background-color: {CHART_COLORS[2]}"
												></div>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-gray-500 text-center py-12">No monthly data available</p>
							{/if}
						</div>
					</div>

					<!-- Customer Analysis -->
					<div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
						<h3 class="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
							<svg class="w-4 h-4 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
							</svg>
							Customer Analysis
						</h3>
						<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
							<!-- Customer Order Frequency -->
							<div class="lg:col-span-2">
								<h4 class="text-xs font-semibold text-gray-700 mb-3">Order Frequency Distribution</h4>
								<div class="space-y-2">
									{#each analyticsData.customerOrderFrequency as freq}
										<div>
											<div class="flex justify-between items-center mb-1">
												<span class="text-xs font-medium text-gray-700">{freq.frequency}</span>
												<span class="text-xs font-bold text-gray-900">{freq.customerCount} {freq.customerCount === 1 ? 'customer' : 'customers'}</span>
											</div>
											<div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
												<div
													class="h-full rounded-full transition-all duration-300"
													style="width: {(freq.customerCount / Math.max(...analyticsData.customerOrderFrequency.map(f => f.customerCount), 1)) * 100}%; background-color: {CHART_COLORS[1]}"
												></div>
											</div>
										</div>
									{/each}
								</div>
							</div>
							<!-- Customer Stats -->
							<div class="bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-200 rounded-lg p-3">
								<h4 class="text-xs font-semibold text-gray-700 mb-3">Key Metrics</h4>
								<div class="space-y-2">
									<div class="bg-white rounded-lg p-3 border border-pink-200">
										<p class="text-xs font-semibold text-gray-600 uppercase mb-1">Repeat Customers</p>
										<p class="text-lg font-bold text-gray-900">{analyticsData.repeatCustomers}</p>
									</div>
									<div class="bg-white rounded-lg p-3 border border-purple-200">
										<p class="text-xs font-semibold text-gray-600 uppercase mb-1">New Customers</p>
										<p class="text-lg font-bold text-gray-900">{analyticsData.newCustomers}</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Operational Insights -->
					<div class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
						<h3 class="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
							<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							Pending Orders Aging
						</h3>
						{#if analyticsData.pendingOrdersAging.length > 0}
							<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
								{#each analyticsData.pendingOrdersAging as pending}
									<div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors">
										<div class="flex items-start justify-between mb-2">
											<div class="flex-1 min-w-0">
												<p class="text-sm font-semibold text-gray-900 truncate">{pending.customerName}</p>
												<p class="text-xs text-gray-500 mt-1">Order: {pending.orderId}...</p>
											</div>
										</div>
										<div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
											<span class="text-xs text-gray-600">{pending.itemCount} {pending.itemCount === 1 ? 'item' : 'items'}</span>
											<span class="text-sm font-bold {pending.daysPending > 7 ? 'text-red-600' : pending.daysPending > 3 ? 'text-orange-600' : 'text-gray-900'}">
												{pending.daysPending} {pending.daysPending === 1 ? 'day' : 'days'}
											</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
								<svg class="w-12 h-12 text-green-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<p class="text-gray-700 font-medium">All orders are processed!</p>
								<p class="text-sm text-gray-500 mt-1">No pending orders at this time</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Collapsed Analytics Button -->
			<button
				on:click={() => showAnalytics = true}
				class="w-full bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
			>
				<div class="flex items-center gap-3">
					<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
					</svg>
					<span class="font-semibold text-gray-900">Show Analytics & Insights</span>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
				</svg>
			</button>
		{/if}

		<!-- Filters and Search -->
		<div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
			<div class="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
				<h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
					<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
					</svg>
					Filter & Search Orders
				</h2>
			</div>
			<div class="p-6 space-y-5">
				<!-- Search Bar -->
				<div>
					<label
						for="search-orders"
						class="block text-sm font-semibold text-gray-700 mb-2"
						>Search Orders</label
					>
					<div class="relative">
						<input
							id="search-orders"
							type="text"
							bind:value={searchQuery}
							placeholder="Search by customer name, comments, or order ID..."
							class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
						/>
						<svg class="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
						</svg>
					</div>
				</div>

				<!-- Filters Row -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
					<!-- Status Filter -->
					<div>
						<label
							for="filter-status"
							class="block text-sm font-semibold text-gray-700 mb-2"
							>Status</label
						>
						<select
							id="filter-status"
							bind:value={filterStatus}
							class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
						>
							<option value="all">All Statuses</option>
							<option value="Pending">Pending</option>
							<option value="Processed">Processed</option>
							<option value="Dispatched">Dispatched</option>
						</select>
					</div>

					<!-- Sort By -->
					<div>
						<label
							for="sort-by"
							class="block text-sm font-semibold text-gray-700 mb-2"
							>Sort By</label
						>
						<select
							id="sort-by"
							bind:value={sortBy}
							class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
						>
							<option value="created">Date Created</option>
							<option value="customer">Customer Name</option>
							<option value="status">Status</option>
						</select>
					</div>

					<!-- Sort Order -->
					<div>
						<label
							for="sort-order"
							class="block text-sm font-semibold text-gray-700 mb-2"
							>Sort Order</label
						>
						<select
							id="sort-order"
							bind:value={sortOrder}
							class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
						>
							<option value="desc">Newest First</option>
							<option value="asc">Oldest First</option>
						</select>
					</div>
				</div>

				<!-- Results Count -->
				<div class="flex items-center justify-between pt-4 border-t border-gray-200">
					<div class="text-sm text-gray-600">
						Showing <span class="font-bold text-gray-900">{filteredOrders.length}</span>
						of <span class="font-bold text-gray-900">{orders.length}</span> loaded orders
						{#if hasMore && !searchQuery && filterStatus === "all"}
							<span class="text-gray-400 ml-1">(more available)</span>
						{/if}
					</div>
					{#if searchQuery || filterStatus !== "all"}
						<button
							on:click={() => { searchQuery = ""; filterStatus = "all"; }}
							class="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
							Clear filters
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Orders Table -->
		<div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
			<div class="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
				<h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
					<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
					</svg>
					Orders List
				</h2>
			</div>
			{#if loading}
				<div class="p-12 text-center">
					<svg class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<p class="text-gray-600 font-medium">Loading orders...</p>
				</div>
			{:else if filteredOrders.length === 0}
				<div class="p-12 text-center">
					<svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
					</svg>
					<p class="text-gray-700 font-semibold text-lg mb-1">
						No orders found
					</p>
					<p class="text-gray-500 text-sm">
						{searchQuery || filterStatus !== "all"
							? "Try adjusting your filters or search terms."
							: "Create your first order to get started!"}
					</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-gray-50 border-b-2 border-gray-200">
							<tr>
								<th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</th>
								<th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
								<th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Invoice Amount</th>
								<th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Comments</th>
								<th class="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Created</th>
								<th class="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each filteredOrders as order (order.id)}
								<tr
									class="hover:bg-blue-50 transition-colors cursor-pointer group"
									on:click={() => viewOrderDetails(order)}
								>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm font-semibold text-gray-900">
											{order.expand?.customer?.name ||
												getCustomerName(order.customer) ||
												"Unknown"}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex px-3 py-1 rounded-full text-xs font-bold {getStatusColor(
												order.status,
											)}"
										>
											{order.status}
										</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm font-semibold text-gray-900">
											Ksh {order.invoice_amount?.toFixed(2) || "0.00"}
										</div>
									</td>
									<td class="px-6 py-4">
										<div class="text-sm text-gray-600 max-w-xs truncate" title={order.comments || "-"}>
											{order.comments || "-"}
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-600">
											{formatDate(order.created)}
										</div>
									</td>
									<td
										class="px-6 py-4 whitespace-nowrap text-center"
										on:click|stopPropagation={() => {}}
									>
										<div class="flex justify-center gap-2">
											<button
												on:click={() => openEditModal(order)}
												type="button"
												title="Edit order"
												class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
											>
												<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
												</svg>
											</button>
											<button
												on:click={() => openDeleteConfirm(order)}
												type="button"
												title="Delete order"
												class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
											>
												<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
												</svg>
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if !loading && hasMore && filteredOrders.length > 0}
					<div class="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-center">
						<button
							on:click={loadMoreOrders}
							disabled={loadingMore}
							class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
						>
							{#if loadingMore}
								<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Loading...
							{:else}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
								</svg>
								Load More Orders
							{/if}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</main>

	<!-- Create/Edit Modal -->
	{#if showCreateModal || showEditModal}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		>
			<div
				class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
			>
				<!-- Header -->
				<div
					class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center"
				>
					<div class="flex items-center gap-3">
						<div class="bg-white/20 p-2 rounded-lg">
							<svg
								class="w-5 h-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								></path>
							</svg>
						</div>
						<div>
							<h2 class="text-xl font-bold text-white">
								{showCreateModal ? "New Order" : "Edit Order"}
							</h2>
							{#if showEditModal && selectedOrder}
								<p class="text-blue-100 text-xs">
									ID: {selectedOrder.id.substring(0, 12)}...
								</p>
							{/if}
						</div>
					</div>
					<button
						on:click={showCreateModal
							? closeCreateModal
							: closeEditModal}
						class="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1 transition-colors"
						aria-label="Close modal"
					>
						<svg
							class="w-6 h-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							></path>
						</svg>
					</button>
				</div>

				<!-- Content -->
				<div class="flex-1 overflow-y-auto p-6">
					<div class="space-y-5">
						<!-- Main Order Info - Compact Grid -->
						<div class="grid grid-cols-2 gap-4">
							<!-- Customer Search -->
							<div class="relative">
								<label
									for="customer-search"
									class="block text-xs font-semibold text-gray-700 uppercase mb-1.5"
									>Customer *</label
								>
								<div class="relative">
									<input
										id="customer-search"
										type="text"
										bind:value={customerSearchQuery}
										on:input={filterCustomers}
										on:keydown={handleCustomerKeydown}
										on:focus={() => {
											if (
												customerSearchQuery.length >= 1
											) {
												filterCustomers();
											}
										}}
										on:blur={() => {
											setTimeout(() => {
												showCustomerDropdown = false;
											}, 200);
										}}
										placeholder="Search customer..."
										autocomplete="off"
										class="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
									/>
									<!-- Search Icon -->
									<svg
										class="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
										></path>
									</svg>
									<!-- Clear Button -->
									{#if customerSearchQuery}
										<button
											type="button"
											on:click={clearCustomerSearch}
											class="absolute right-8 top-2.5 p-1 text-gray-400 hover:text-gray-600 transition-colors"
											title="Clear"
										>
											<svg
												class="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M6 18L18 6M6 6l12 12"
												></path>
											</svg>
										</button>
									{/if}
								</div>

								<!-- Dropdown Results -->
								{#if showCustomerDropdown && filteredCustomers.length > 0}
									<div
										class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
									>
										{#each filteredCustomers as customer, index (customer.id)}
											<button
												type="button"
												on:click={() =>
													selectCustomer(customer)}
												class="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 transition-colors flex items-center justify-between {index ===
												selectedCustomerIndex
													? 'bg-blue-100'
													: ''}"
											>
												<div>
													<div
														class="font-medium text-gray-900"
													>
														{customer.name}
													</div>
													{#if customer.region}
														<div
															class="text-xs text-gray-500"
														>
															{customer.region}
														</div>
													{/if}
												</div>
												{#if formData.customer === customer.id}
													<svg
														class="w-4 h-4 text-blue-600"
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path
															fill-rule="evenodd"
															d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
															clip-rule="evenodd"
														></path>
													</svg>
												{/if}
											</button>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Status -->
							<div>
								<label
									for="status-select"
									class="block text-xs font-semibold text-gray-700 uppercase mb-1.5"
									>Status</label
								>
								<select
									id="status-select"
									bind:value={formData.status}
									class="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
								>
									<option value="Pending">Pending</option>
									<option value="Processed">Processed</option>
									<option value="Dispatched"
										>Dispatched</option
									>
								</select>
							</div>

							<!-- Invoice Amount -->
							<div class="col-span-2">
								<label
									for="invoice_amount"
									class="block text-xs font-semibold text-gray-700 uppercase mb-1.5"
									>Invoice Amount *</label
								>
								<div class="relative">
									<span
										class="absolute left-3 top-2.5 text-gray-500 font-medium text-sm"
										>Ksh</span
									>
									<input
										id="invoice_amount"
										type="number"
										bind:value={formData.invoice_amount}
										min="0"
										step="0.01"
										placeholder="0.00"
										class="w-full pl-12 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
									/>
								</div>
							</div>
						</div>

						<!-- Comments - Compact -->
						<div>
							<label
								for="comments"
								class="block text-xs font-semibold text-gray-700 uppercase mb-1.5"
								>Comments (Optional)</label
							>
							<textarea
								id="comments"
								bind:value={formData.comments}
								placeholder="Add notes about this order..."
								rows="2"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm resize-none"
							></textarea>
						</div>

						<!-- Order Items - Streamlined -->
						<div class="border-t border-gray-200 pt-4">
							<div class="flex items-center justify-between mb-3">
								<div class="flex items-center gap-2">
									<svg
										class="w-4 h-4 text-purple-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M16 11V7a4 4 0 00-8 0v4M8 11h8l.64 6.36A2 2 0 0114.64 19H9.36a2 2 0 01-1.99-1.64L8 11z"
										></path>
									</svg>
									<h3 class="text-sm font-bold text-gray-900">
										Order Items
									</h3>
									<span
										class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold"
										>{formData.items.length}</span
									>
								</div>
								<button
									type="button"
									on:click={addItem}
									class="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-xs font-semibold transition-colors shadow-sm"
								>
									<svg
										class="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 6v6m0 0v6m0-6h6m-6 0H6"
										></path>
									</svg>
									Add Item
								</button>
							</div>

							{#if formData.items.length === 0}
								<div
									class="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center"
								>
									<svg
										class="w-10 h-10 text-gray-400 mx-auto mb-2"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m8-5v2m0 0v2m0-2h2m-2 0H8"
										></path>
									</svg>
									<p
										class="text-sm text-gray-600 font-medium"
									>
										No items yet
									</p>
									<p class="text-xs text-gray-500 mt-1">
										Click "Add Item" to get started
									</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each formData.items as item, index (index)}
										<div
											class="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
										>
											<div
												class="flex gap-3 items-center"
											>
												<!-- Product Select -->
												<div class="flex-1">
													<select
														id="product-{index}"
														bind:value={
															item.product
														}
														class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
													>
														<option value=""
															>Select product</option
														>
														{#each products as product (product.id)}
															<option
																value={product.id}
																>{product.name}</option
															>
														{/each}
													</select>
												</div>

												<!-- Quantity Input -->
												<div class="w-24">
													<input
														id="quantity-{index}"
														type="number"
														bind:value={
															item.quantity
														}
														min="1"
														placeholder="Qty"
														class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-center"
													/>
												</div>

												<!-- Remove Button -->
												<button
													type="button"
													on:click={() =>
														removeItem(index)}
													class="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
													title="Remove item"
												>
													<svg
														class="w-4 h-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														/>
													</svg>
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Timestamps (for edit only) - Compact -->
						{#if showEditModal && selectedOrder}
							<div class="border-t border-gray-200 pt-4">
								<div class="grid grid-cols-2 gap-3">
									<div
										class="bg-blue-50 border border-blue-200 rounded-lg p-3"
									>
										<p
											class="text-xs font-semibold text-blue-700 uppercase"
										>
											Created
										</p>
										<p class="text-xs text-blue-900 mt-1">
											{formatDate(selectedOrder.created)}
										</p>
									</div>
									<div
										class="bg-green-50 border border-green-200 rounded-lg p-3"
									>
										<p
											class="text-xs font-semibold text-green-700 uppercase"
										>
											Updated
										</p>
										<p class="text-xs text-green-900 mt-1">
											{formatDate(selectedOrder.updated)}
										</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer Actions -->
				<div
					class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3"
				>
					<button
						on:click={showCreateModal
							? closeCreateModal
							: closeEditModal}
						class="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-white font-medium transition-colors text-sm"
					>
						Cancel
					</button>
					<button
						on:click={showCreateModal ? createOrder : updateOrder}
						disabled={loading}
						class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm text-sm"
					>
						{loading
							? "Processing..."
							: showCreateModal
								? "Create Order"
								: "Update Order"}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm && selectedOrder}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		>
			<div class="bg-white rounded-lg shadow-xl max-w-md w-full">
				<div class="p-6">
					<h2 class="text-xl font-bold text-gray-900 mb-2">
						Delete Order?
					</h2>
					<p class="text-gray-600 mb-4">
						Are you sure you want to delete order <span
							class="font-mono text-sm"
							>{selectedOrder.id.substring(0, 12)}...</span
						>
						for customer
						<span class="font-semibold"
							>{selectedOrder.expand?.customer?.name ||
								getCustomerName(selectedOrder.customer)}</span
						>?
					</p>
					<p class="text-sm text-gray-500 mb-6">
						This action cannot be undone.
					</p>

					<div class="flex justify-end gap-3">
						<button
							on:click={closeDeleteConfirm}
							class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
						>
							Cancel
						</button>
						<button
							on:click={deleteOrder}
							disabled={loading}
							class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{loading ? "Deleting..." : "Delete Order"}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Order Details Card -->
	{#if showDetailCard && selectedOrder}
		<div
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		>
			<div
				class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-90vh overflow-y-auto"
			>
				<div
					class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center"
				>
					<h2 class="text-xl font-bold text-gray-900">
						Order Details
					</h2>
					<button
						on:click={closeDetailCard}
						class="text-gray-500 hover:text-gray-700 text-2xl"
					>
						×
					</button>
				</div>

				<div class="p-6 space-y-6">
					<!-- Order Header -->
					<div class="grid grid-cols-2 md:grid-cols-5 gap-4">
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Order ID
							</p>
							<p class="text-sm font-mono text-gray-900 mt-1">
								{selectedOrder.id.substring(0, 8)}...
							</p>
						</div>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Customer
							</p>
							<p class="text-sm text-gray-900 mt-1">
								{selectedOrder.expand?.customer?.name ||
									"Unknown"}
							</p>
						</div>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Status
							</p>
							<p class="mt-1">
								<span
									class="px-3 py-1 rounded-full text-xs font-semibold {getStatusColor(
										selectedOrder.status,
									)}"
								>
									{selectedOrder.status}
								</span>
							</p>
						</div>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Invoice Amount
							</p>
							<p class="text-sm text-gray-900 mt-1">
								Ksh {selectedOrder.invoice_amount?.toFixed(2) ||
									"0.00"}
							</p>
						</div>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Region
							</p>
							<p class="text-sm text-gray-900 mt-1">
								{selectedOrder.expand?.customer?.region || "-"}
							</p>
						</div>
					</div>

					<!-- Timestamps -->
					<div
						class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200"
					>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Created
							</p>
							<p class="text-sm text-gray-600 mt-1">
								{formatDate(selectedOrder.created)}
							</p>
						</div>
						<div>
							<p
								class="text-xs font-semibold text-gray-700 uppercase"
							>
								Last Updated
							</p>
							<p class="text-sm text-gray-600 mt-1">
								{formatDate(selectedOrder.updated)}
							</p>
						</div>
					</div>

					<!-- Comments -->
					{#if selectedOrder.comments}
						<div class="pt-4 border-t border-gray-200">
							<p
								class="text-xs font-semibold text-gray-700 uppercase mb-2"
							>
								Comments
							</p>
							<p
								class="text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-200"
							>
								{selectedOrder.comments}
							</p>
						</div>
					{/if}

					<!-- Order Items -->
					<div class="pt-4 border-t border-gray-200">
						<h3 class="text-sm font-semibold text-gray-900 mb-4">
							Order Items
						</h3>
						{#if !selectedOrderDetails || selectedOrderDetails.length === 0}
							<div
								class="bg-gray-50 border border-gray-200 rounded p-4 text-center text-sm text-gray-600"
							>
								No items in this order
							</div>
						{:else}
							<div class="space-y-2">
								{#each selectedOrderDetails as item (item.id)}
									<div
										class="flex items-center justify-between bg-gray-50 p-4 rounded border border-gray-200 hover:border-gray-300 transition-colors"
									>
										<div class="flex-1">
											<p
												class="font-medium text-gray-900"
											>
												{item.expand?.product?.name ||
													"Unknown Product"}
											</p>
											{#if item.expand?.product?.size}
												<p
													class="text-xs text-gray-600 mt-1"
												>
													Size: {item.expand.product
														.size}
												</p>
											{/if}
										</div>
										<div class="text-right">
											<p
												class="font-semibold text-gray-900"
											>
												<svg
													class="w-4 h-4 inline mr-1"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2a8 8 0 100 16 8 8 0 000-16zm3.5 8a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-7 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
													/>
												</svg>
												{item.quantity}
											</p>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Close Button -->
				<div
					class="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3"
				>
					<button
						on:click={closeDetailCard}
						class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Success Notification -->
	{#if showNotification}
		<div class="fixed top-4 right-4 z-50 animate-fade-in">
			<div
				class="bg-white border-l-4 border-green-500 rounded-lg shadow-lg p-4 max-w-sm"
			>
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<svg
							class="h-5 w-5 text-green-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							></path>
						</svg>
					</div>
					<div class="ml-3">
						<p class="text-sm font-medium text-gray-900">
							{notificationMessage}
						</p>
					</div>
					<div class="ml-auto pl-3">
						<button
							on:click={() => (showNotification = false)}
							class="inline-flex rounded-md p-1.5 text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-gray-600"
						>
							<span class="sr-only">Dismiss</span>
							<svg
								class="h-5 w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								></path>
							</svg>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body.modal-open) {
		overflow: hidden;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}
</style>
