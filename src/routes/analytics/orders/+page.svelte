<script lang="ts">
	import { onMount } from 'svelte';
	import pb from '$lib/pocketbase';
	import { orders, orderItems, customers, products } from '$lib/stores/dataStore';

	// State - using stores for data
	let localOrders: any[] = [];
	let localOrderItems: any[] = [];
	let localCustomers: any[] = [];
	let localProducts: any[] = [];
	let filteredOrders: any[] = [];
	let loading = false;
	let searchQuery = '';
	let sortBy = 'created'; // 'created', 'date', 'customer', 'status'
	let sortOrder = 'desc'; // 'asc', 'desc'
	let statusFilter = 'all'; // 'all', 'Pending', 'Processed', 'Dispatched'
	
	// Subscribe to stores
	orders.subscribe(value => {
		localOrders = value;
	});

	orderItems.subscribe(value => {
		localOrderItems = value;
	});

	customers.subscribe(value => {
		localCustomers = value;
	});

	products.subscribe(value => {
		localProducts = value;
	});

	// Modal States
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteConfirm = false;
	let showOrderItemsModal = false;
	let selectedOrder: any = null;
	let selectedOrderItems: any[] = [];

	// Form Data
	let formData = {
		customer: '',
		customerSearch: '',
		date: new Date().toISOString().split('T')[0],
		status: 'Pending',
		notes: '',
		items: [] as Array<{ product: string; quantity: string }>
	};

	// Customer search
	let customerSuggestions: any[] = [];
	let showCustomerSuggestions = false;
	let customerInputFocused = false;

	// Status options
	const statusOptions = ['Pending', 'Processed', 'Dispatched'];

	// Load orders - data is already loaded from store
	function loadOrders() {
		loading = true;
		filterAndSortOrders();
		loading = false;
	}

	// Filter and sort orders
	function filterAndSortOrders() {
		let result = [...localOrders];

		// Status filter
		if (statusFilter !== 'all') {
			result = result.filter(o => o.status === statusFilter);
		}

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(o => {
				const customer = localCustomers.find(c => c.id === o.customer);
				const customerName = customer?.name?.toLowerCase() || '';
				const orderDate = new Date(o.date || o.created).toLocaleDateString().toLowerCase();
				const status = o.status?.toLowerCase() || '';
				return customerName.includes(query) || orderDate.includes(query) || status.includes(query);
			});
		}

		// Sort
		result.sort((a, b) => {
			let aVal: any;
			let bVal: any;

			if (sortBy === 'created' || sortBy === 'date') {
				aVal = new Date(a.date || a.created).getTime();
				bVal = new Date(b.date || b.created).getTime();
			} else if (sortBy === 'customer') {
				const customerA = localCustomers.find(c => c.id === a.customer);
				const customerB = localCustomers.find(c => c.id === b.customer);
				aVal = customerA?.name || '';
				bVal = customerB?.name || '';
			} else if (sortBy === 'status') {
				aVal = a.status || '';
				bVal = b.status || '';
			}

			if (sortOrder === 'asc') {
				return aVal > bVal ? 1 : -1;
			} else {
				return aVal < bVal ? 1 : -1;
			}
		});

		filteredOrders = result;
	}

	// Get customer name for order
	function getCustomerName(order: any): string {
		const customer = localCustomers.find(c => c.id === order.customer);
		return customer?.name || 'Unknown';
	}

	// Get order items for order
	function getOrderItems(order: any): any[] {
		return localOrderItems.filter(oi => oi.order === order.id);
	}

	// Get total quantity for order
	function getTotalQuantity(order: any): number {
		const items = getOrderItems(order);
		return items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
	}

	// Get order total value
	function getOrderTotal(order: any): number {
		const items = getOrderItems(order);
		return items.reduce((sum, item) => {
			const product = localProducts.find(p => p.id === item.product);
			const price = parseFloat(product?.price || 0);
			const quantity = parseInt(item.quantity) || 0;
			return sum + (price * quantity);
		}, 0);
	}

	// Filter customers for autocomplete
	function filterCustomers(query: string) {
		if (!query) {
			customerSuggestions = [];
			showCustomerSuggestions = false;
			return;
		}
		const q = query.toLowerCase();
		customerSuggestions = localCustomers
			.filter(c => c.name?.toLowerCase().includes(q))
			.slice(0, 10);
		// Only show suggestions if input is focused
		showCustomerSuggestions = customerInputFocused && customerSuggestions.length > 0;
	}

	// Select customer from search
	function selectCustomer(customer: any, event?: MouseEvent) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		formData.customer = customer.id;
		formData.customerSearch = customer.name;
		customerInputFocused = false;
		showCustomerSuggestions = false;
		customerSuggestions = [];
		// Force reactivity update
		formData = formData;
	}

	// Handle click outside to close suggestions
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.customer-autocomplete')) {
			showCustomerSuggestions = false;
		}
	}


	// Add new item row
	function addItemRow() {
		formData.items = [...formData.items, {
			product: '',
			quantity: ''
		}];
	}

	// Remove item row
	function removeItemRow(index: number) {
		formData.items = formData.items.filter((_, i) => i !== index);
	}

	// Create order
	async function createOrder() {
		if (!formData.customer) {
			alert('Please select a customer');
			return;
		}

		if (!formData.date) {
			alert('Date is required');
			return;
		}

		// Filter out invalid items
		const validItems = formData.items.filter(item => item.product && item.quantity);
		
		if (validItems.length === 0) {
			alert('Please add at least one order item');
			return;
		}

		try {
			loading = true;
			
			// Create the order first
			const newOrder = await pb.collection('orders').create({
				customer: formData.customer,
				date: formData.date,
				status: formData.status,
				notes: formData.notes
			});

			// Create order items
			for (const item of validItems) {
				try {
					await pb.collection('order_items').create({
						order: newOrder.id,
						product: item.product,
						quantity: parseInt(item.quantity) || 1
					});
				} catch (itemError) {
					console.error('Error creating order item:', itemError);
				}
			}

			// Show success message
			alert(`Order created successfully! ${validItems.length} item(s) added.`);
			
			// Reset form but keep modal open
			formData = {
				customer: '',
				customerSearch: '',
				date: new Date().toISOString().split('T')[0],
				status: 'Pending',
				notes: '',
				items: []
			};
			customerSuggestions = [];
			showCustomerSuggestions = false;
			customerInputFocused = false;
			
			// Add first empty item row
			setTimeout(() => addItemRow(), 100);
		} catch (error) {
			console.error('Error creating order:', error);
			alert('Failed to create order');
		} finally {
			loading = false;
		}
	}

	// Update order
	async function updateOrder() {
		if (!formData.customer) {
			alert('Customer is required');
			return;
		}

		if (!formData.date) {
			alert('Date is required');
			return;
		}

		// Filter out invalid items
		const validItems = formData.items.filter(item => item.product && item.quantity);
		
		if (validItems.length === 0) {
			alert('Please add at least one order item');
			return;
		}

		try {
			loading = true;
			
			// Update the order
			await pb.collection('orders').update(selectedOrder.id, {
				customer: formData.customer,
				date: formData.date,
				status: formData.status,
				notes: formData.notes
			});

			// Get existing order items
			const existingItems = getOrderItems(selectedOrder);
			const existingItemIds = new Set(existingItems.map(item => item.id));
			
			// Update or create order items
			for (const item of validItems) {
				try {
					if (item.itemId && existingItemIds.has(item.itemId)) {
						// Update existing item
						await pb.collection('order_items').update(item.itemId, {
							product: item.product,
							quantity: parseInt(item.quantity) || 1
						});
						existingItemIds.delete(item.itemId);
					} else {
						// Create new item
						await pb.collection('order_items').create({
							order: selectedOrder.id,
							product: item.product,
							quantity: parseInt(item.quantity) || 1
						});
					}
				} catch (itemError) {
					console.error('Error updating/creating order item:', itemError);
				}
			}
			
			// Delete items that were removed
			for (const itemId of existingItemIds) {
				try {
					await pb.collection('order_items').delete(itemId);
				} catch (deleteError) {
					console.error('Error deleting order item:', deleteError);
				}
			}

			// Real-time subscription will handle the update
			closeEditModal();
		} catch (error) {
			console.error('Error updating order:', error);
			alert('Failed to update order');
		} finally {
			loading = false;
		}
	}

	// Delete order
	async function deleteOrder() {
		try {
			loading = true;
			// First delete all order items
			const items = getOrderItems(selectedOrder);
			for (const item of items) {
				try {
					await pb.collection('order_items').delete(item.id);
				} catch (error) {
					console.error('Error deleting order item:', error);
				}
			}
			// Then delete the order
			await pb.collection('orders').delete(selectedOrder.id);

			// Real-time subscription will handle the deletion
			closeDeleteConfirm();
		} catch (error) {
			console.error('Error deleting order:', error);
			alert('Failed to delete order');
		} finally {
			loading = false;
		}
	}

	// Modal functions
	function openCreateModal() {
		formData = {
			customer: '',
			customerSearch: '',
			date: new Date().toISOString().split('T')[0],
			status: 'Pending',
			notes: '',
			items: []
		};
		customerSuggestions = [];
		showCustomerSuggestions = false;
		customerInputFocused = false;
		showCreateModal = true;
		// Add first empty item row
		setTimeout(() => addItemRow(), 100);
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function openEditModal(order: any) {
		selectedOrder = order;
		const customer = localCustomers.find(c => c.id === order.customer);
		const orderItems = getOrderItems(order);
		
		// Load order items into form data
		const items = orderItems.map(item => ({
			product: item.product || '',
			quantity: item.quantity ? item.quantity.toString() : '',
			itemId: item.id // Store the item ID for updates
		}));
		
		formData = {
			customer: order.customer || '',
			customerSearch: customer?.name || '',
			date: order.date ? new Date(order.date).toISOString().split('T')[0] : new Date(order.created).toISOString().split('T')[0],
			status: order.status || 'Pending',
			notes: order.notes || '',
			items: items
		};
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedOrder = null;
	}

	function openDeleteConfirm(order: any) {
		selectedOrder = order;
		showDeleteConfirm = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
		selectedOrder = null;
	}

	function openOrderItemsModal(order: any) {
		selectedOrder = order;
		selectedOrderItems = getOrderItems(order);
		showOrderItemsModal = true;
	}

	function closeOrderItemsModal() {
		showOrderItemsModal = false;
		selectedOrder = null;
		selectedOrderItems = [];
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'Processed':
				return 'bg-green-100 text-green-800';
			case 'Dispatched':
				return 'bg-blue-100 text-blue-800';
			case 'Pending':
				return 'bg-yellow-100 text-yellow-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	onMount(() => {
		loadOrders();
	});

	// Reactive statement: filter when data or filters change
	$: if (localOrders.length >= 0) {
		filterAndSortOrders();
	}

	$: if (searchQuery !== undefined || sortBy !== undefined || sortOrder !== undefined || statusFilter !== undefined) {
		filterAndSortOrders();
	}

	// Auto-filter customers when search changes (only if focused)
	$: if (formData.customerSearch !== undefined && customerInputFocused) {
		filterCustomers(formData.customerSearch);
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-8">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Orders</h1>
				<p class="text-gray-600 mt-1">Manage all your orders in one place</p>
			</div>
			<button
				on:click={openCreateModal}
				class="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Order
			</button>
		</div>

		<!-- Search and Filter Bar -->
		<div class="bg-white rounded-lg shadow-sm p-4 mb-6">
			<div class="flex flex-col md:flex-row gap-4">
				<div class="flex-1">
					<input
						type="text"
						placeholder="Search by customer, date, or status..."
						bind:value={searchQuery}
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div class="flex gap-2">
					<select
						bind:value={statusFilter}
						class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All Status</option>
						<option value="Pending">Pending</option>
						<option value="Processed">Processed</option>
						<option value="Dispatched">Dispatched</option>
					</select>
					<select
						bind:value={sortBy}
						class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="created">Sort by Date</option>
						<option value="customer">Sort by Customer</option>
						<option value="status">Sort by Status</option>
					</select>
					<button
						on:click={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
						class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
						title="Toggle sort order"
					>
						<svg
							class="w-5 h-5 {sortOrder === 'desc' ? 'rotate-180' : ''}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Loading State -->
		{#if loading && filteredOrders.length === 0}
			<div class="bg-white rounded-lg shadow-sm p-8 text-center">
				<div class="inline-block">
					<svg class="w-8 h-8 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
					</svg>
				</div>
				<p class="text-gray-600 mt-4">Loading orders...</p>
			</div>
		{:else if filteredOrders.length === 0}
			<div class="bg-white rounded-lg shadow-sm p-12 text-center">
				<svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
				</svg>
				<p class="text-gray-600 text-lg">No orders found</p>
				<p class="text-gray-500 mt-1">
					{searchQuery || statusFilter !== 'all' ? 'Try adjusting your search criteria' : 'Get started by adding a new order'}
				</p>
			</div>
		{:else}
			<!-- Orders Table -->
			<div class="bg-white rounded-lg shadow-sm overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="bg-gray-50 border-b border-gray-200">
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Date</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Items</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Total Quantity</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Total Value</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each filteredOrders as order (order.id)}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="px-6 py-4 text-sm text-gray-900">
										{new Date(order.date || order.created).toLocaleDateString('en-US', { 
											year: 'numeric', 
											month: 'short', 
											day: 'numeric' 
										})}
									</td>
									<td class="px-6 py-4 text-sm text-gray-900 font-medium">{getCustomerName(order)}</td>
									<td class="px-6 py-4 text-sm text-gray-600">
										{getOrderItems(order).length} item(s)
									</td>
									<td class="px-6 py-4 text-sm text-gray-900 font-semibold">
										{getTotalQuantity(order)}
									</td>
									<td class="px-6 py-4 text-sm text-gray-900 font-semibold">
										KES {getOrderTotal(order).toFixed(2)}
									</td>
									<td class="px-6 py-4 text-sm">
										<span class="px-2 py-1 rounded text-xs font-semibold {getStatusColor(order.status || 'Pending')}">
											{order.status || 'Pending'}
										</span>
									</td>
									<td class="px-6 py-4 text-sm">
										<div class="flex gap-2">
											<button
												on:click={() => openOrderItemsModal(order)}
												class="text-blue-600 hover:text-blue-900 font-medium transition-colors"
												title="View items"
											>
												View
											</button>
											<button
												on:click={() => openEditModal(order)}
												class="text-green-600 hover:text-green-900 font-medium transition-colors"
											>
												Edit
											</button>
											<button
												on:click={() => openDeleteConfirm(order)}
												class="text-red-600 hover:text-red-900 font-medium transition-colors"
											>
												Delete
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>

	<!-- Create Modal - Fast Entry Card -->
	{#if showCreateModal}
		<div 
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto" 
			on:click={handleClickOutside}
			on:keydown={(e) => e.key === 'Escape' && closeCreateModal()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
		>
			<div 
				class="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8" 
				on:click|stopPropagation
				role="document"
			>
				<!-- Header -->
				<div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
					<h2 id="modal-title" class="text-xl font-bold text-gray-900">New Order</h2>
					<button
						on:click={closeCreateModal}
						aria-label="Close modal"
						class="text-gray-500 hover:text-gray-700 transition-colors"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<form on:submit|preventDefault={createOrder} class="p-6 space-y-4">
					<!-- Customer -->
					<div>
						<label for="create-customer" class="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
						<div class="relative customer-autocomplete">
							<input
								id="create-customer"
								type="text"
								bind:value={formData.customerSearch}
								on:input={(e) => {
									const value = e.currentTarget.value;
									formData.customerSearch = value;
									if (customerInputFocused) {
										filterCustomers(value);
									}
									if (!value) {
										formData.customer = '';
									}
								}}
								on:focus={() => {
									customerInputFocused = true;
									if (formData.customerSearch) {
										filterCustomers(formData.customerSearch);
									}
								}}
								on:blur={(e) => {
									// Delay closing suggestions to allow click to register
									setTimeout(() => {
										customerInputFocused = false;
										showCustomerSuggestions = false;
									}, 200);
								}}
								placeholder="Search and select customer..."
								required
								class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							{#if showCustomerSuggestions && customerInputFocused && customerSuggestions.length > 0}
								<div class="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
									{#each customerSuggestions as customer}
										<button
											type="button"
											on:click={(e) => selectCustomer(customer, e)}
											on:mousedown|preventDefault
											class="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors cursor-pointer"
										>
											<div class="font-medium text-gray-900">{customer.name}</div>
											{#if customer.phone}
												<div class="text-xs text-gray-500">{customer.phone}</div>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Date and Status -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="create-date" class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
							<input
								id="create-date"
								type="date"
								bind:value={formData.date}
								required
								class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label for="create-status" class="block text-sm font-medium text-gray-700 mb-1">Status *</label>
							<select
								id="create-status"
								bind:value={formData.status}
								required
								class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								{#each statusOptions as status}
									<option value={status}>{status}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Order Items -->
					<div class="mb-6">
						<div class="flex items-center justify-between mb-3">
							<span class="block text-sm font-semibold text-gray-700">Order Items</span>
							<button
								type="button"
								on:click={(e) => {
									e.preventDefault();
									e.stopPropagation();
									addItemRow();
								}}
								class="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-1"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								Add Item
							</button>
						</div>
						<div class="max-h-96 overflow-y-auto space-y-3 pr-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
							{#each formData.items as item, index (index)}
								<div class="flex gap-3 items-center p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
									<div class="flex-1">
										<select
											bind:value={item.product}
											class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
										>
											<option value="">Select Product</option>
											{#each localProducts as product}
												<option value={product.id}>
													{product.name}{product.size ? ` ${product.size}` : ''}
												</option>
											{/each}
										</select>
									</div>
									<div class="w-32">
										<input
											type="number"
											bind:value={item.quantity}
											placeholder="Quantity"
											min="1"
											class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
										/>
									</div>
									<button
										type="button"
										on:click={() => removeItemRow(index)}
										class="text-red-600 hover:text-red-800 transition-colors p-2"
										title="Remove item"
									>
										<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
							{/each}
							{#if formData.items.length === 0}
								<p class="text-sm text-gray-500 text-center py-4">Click "Add Item" to add products to this order</p>
							{/if}
						</div>
					</div>

					<!-- Comments -->
					<div>
						<label for="create-notes" class="block text-sm font-medium text-gray-700 mb-1">Comments</label>
						<textarea
							id="create-notes"
							bind:value={formData.notes}
							placeholder="Enter any additional comments..."
							rows="3"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						></textarea>
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-4 border-t border-gray-200">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Creating...' : 'Create Order'}
						</button>
						<button
							type="button"
							on:click={closeCreateModal}
							class="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-gray-300 transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Edit Modal -->
	{#if showEditModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-white rounded-lg shadow-lg max-w-md w-full max-h-screen overflow-y-auto">
				<div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
					<h2 class="text-xl font-bold text-gray-900">Edit Order</h2>
					<button
						on:click={closeEditModal}
						aria-label="Close modal"
						class="text-gray-500 hover:text-gray-700 transition-colors"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<form on:submit|preventDefault={updateOrder} class="p-6 space-y-4">
					<div>
						<label for="edit-customer" class="block text-sm font-medium text-gray-900 mb-1">Customer *</label>
						<select
							id="edit-customer"
							bind:value={formData.customer}
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="">Select a customer</option>
							{#each localCustomers as customer}
								<option value={customer.id}>{customer.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="edit-date" class="block text-sm font-medium text-gray-900 mb-1">Date *</label>
						<input
							id="edit-date"
							type="date"
							bind:value={formData.date}
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="edit-status" class="block text-sm font-medium text-gray-900 mb-1">Status *</label>
						<select
							id="edit-status"
							bind:value={formData.status}
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each statusOptions as status}
								<option value={status}>{status}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="edit-notes" class="block text-sm font-medium text-gray-900 mb-1">Notes</label>
						<textarea
							id="edit-notes"
							bind:value={formData.notes}
							placeholder="Enter order notes"
							rows="3"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						></textarea>
					</div>
					<div class="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Updating...' : 'Update Order'}
						</button>
						<button
							type="button"
							on:click={closeEditModal}
							class="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-white rounded-lg shadow-lg max-w-sm w-full">
				<div class="p-6">
					<div class="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
						<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 class="text-lg font-bold text-gray-900 text-center mb-2">Delete Order</h3>
					<p class="text-gray-600 text-center mb-6">
						Are you sure you want to delete this order for <span class="font-medium">{selectedOrder ? getCustomerName(selectedOrder) : ''}</span>? This will also delete all associated order items. This action cannot be undone.
					</p>
					<div class="flex gap-3">
						<button
							on:click={deleteOrder}
							disabled={loading}
							class="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Deleting...' : 'Delete'}
						</button>
						<button
							on:click={closeDeleteConfirm}
							class="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Order Items Modal -->
	{#if showOrderItemsModal && selectedOrder}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-screen overflow-y-auto">
				<div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
					<h2 class="text-xl font-bold text-gray-900">Order Items</h2>
					<button
						on:click={closeOrderItemsModal}
						aria-label="Close modal"
						class="text-gray-500 hover:text-gray-700 transition-colors"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div class="p-6">
					<div class="mb-4 p-4 bg-gray-50 rounded-lg">
						<p class="text-sm text-gray-600"><span class="font-medium">Customer:</span> {getCustomerName(selectedOrder)}</p>
						<p class="text-sm text-gray-600"><span class="font-medium">Date:</span> {new Date(selectedOrder.date || selectedOrder.created).toLocaleDateString()}</p>
						<p class="text-sm text-gray-600"><span class="font-medium">Status:</span> 
							<span class="px-2 py-1 rounded text-xs font-semibold {getStatusColor(selectedOrder.status || 'Pending')}">
								{selectedOrder.status || 'Pending'}
							</span>
						</p>
						<p class="text-sm text-gray-600"><span class="font-medium">Total Value:</span> KES {getOrderTotal(selectedOrder).toFixed(2)}</p>
						{#if selectedOrder.notes}
							<p class="text-sm text-gray-600 mt-2"><span class="font-medium">Comments:</span> {selectedOrder.notes}</p>
						{/if}
					</div>
					{#if selectedOrderItems.length === 0}
						<p class="text-gray-600 text-center py-8">No items in this order</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead>
									<tr class="bg-gray-50 border-b border-gray-200">
										<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Product</th>
										<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Quantity</th>
										<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Unit Price</th>
										<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Total</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200">
									{#each selectedOrderItems as item}
										{@const product = localProducts.find(p => p.id === item.product)}
										{@const quantity = parseInt(item.quantity) || 0}
										{@const price = parseFloat(product?.price || 0)}
										{@const total = quantity * price}
										<tr class="hover:bg-gray-50">
											<td class="px-4 py-3 text-sm text-gray-900">
												{product?.name || 'Unknown'} {product?.size ? `(${product.size})` : ''}
											</td>
											<td class="px-4 py-3 text-sm text-gray-600">{quantity}</td>
											<td class="px-4 py-3 text-sm text-gray-600">KES {price.toFixed(2)}</td>
											<td class="px-4 py-3 text-sm text-gray-900 font-semibold">KES {total.toFixed(2)}</td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr class="bg-gray-50 border-t-2 border-gray-300">
										<td colspan="3" class="px-4 py-3 text-right text-sm font-semibold text-gray-900">Total:</td>
										<td class="px-4 py-3 text-sm font-bold text-gray-900">KES {getOrderTotal(selectedOrder).toFixed(2)}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
