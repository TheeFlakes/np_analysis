<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import pb from '$lib/pocketbase';

	interface MonthlyData {
		month: string;
		count: number;
	}

	interface Order {
		id: string;
		created: string;
		quantity?: number;
		[key: string]: unknown;
	}

	interface CustomerOrdersData {
		orders: Order[];
		totalOrders: number;
		totalSpent: number;
		monthlyData: MonthlyData[];
	}

	// State
	let customers: any[] = [];
	let filteredCustomers: any[] = [];
	let loading = false;
	let searchQuery = '';
	let sortBy = 'created'; // 'created', 'name', 'phone'
	let sortOrder = 'desc'; // 'asc', 'desc'

	// Modal States
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteConfirm = false;
	let showDetailCard = false;
	let selectedCustomer: any = null;
	let customerOrdersData: CustomerOrdersData | null = null;

	// Form Data
	let formData = {
		name: '',
		region: '',
		address: '',
		contact_person: '',
		phone: '',
		customer_type: 'General Trade'
	};

	// Customer types
	const customerTypes = ['General Trade', 'Retail', 'Wholesale', 'Corporate', 'Individual'];

	// Load customers and subscribe to real-time changes
	async function loadCustomers() {
		loading = true;
		try {
			const customersData = await pb.collection('customers').getList(1, 500, {
				sort: '-created'
			});
			customers = customersData.items;
			filterAndSortCustomers();

			// Subscribe to real-time changes
			subscribeToCustomers();
		} catch (error) {
			console.error('Error loading customers:', error);
		} finally {
			loading = false;
		}
	}

	// View customer details and insights
	async function viewCustomerDetails(customer: any) {
		try {
			selectedCustomer = customer;
			
			// Load customer's orders
			const ordersData = await pb.collection('orders').getList(1, 500, {
				filter: `customer = "${customer.id}"`,
				sort: '-created'
			});
			
			const orders = ordersData.items;
			
			// Load order items for this customer
			let totalSpent = 0;
			let orderQuantities: any[] = [];
			
			for (const order of orders) {
				const items = await pb.collection('order_items').getList(1, 500, {
					filter: `order = "${order.id}"`
				});
				
				for (const item of items.items) {
					totalSpent += item.quantity || 0;
				}
			}
			
			// Calculate orders per month for last 6 months
			const now = new Date();
			const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
			
			const monthlyOrders = new Map<string, number>();
			for (let i = 5; i >= 0; i--) {
				const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
				const key = date.toLocaleString('default', { month: 'short' });
				monthlyOrders.set(key, 0);
			}
			
			// Count orders by month
			orders.forEach(order => {
				const orderDate = new Date(order.created);
				if (orderDate >= sixMonthsAgo) {
					const key = orderDate.toLocaleString('default', { month: 'short' });
					monthlyOrders.set(key, (monthlyOrders.get(key) || 0) + 1);
				}
			});
			
			customerOrdersData = {
				orders: orders.slice(0, 10),
				totalOrders: orders.length,
				totalSpent: totalSpent,
				monthlyData: Array.from(monthlyOrders.entries()).map(([month, count]) => ({ month, count }))
			};
			
			showDetailCard = true;
		} catch (error) {
			console.error('Error loading customer details:', error);
		}
	}

	function closeDetailCard() {
		showDetailCard = false;
		selectedCustomer = null;
		customerOrdersData = null;
	}

	// Subscribe to real-time updates
	function subscribeToCustomers() {
		// Subscribe to create events
		pb.collection('customers').subscribe('*', (e) => {
			if (e.action === 'create') {
				customers = [e.record, ...customers];
				filterAndSortCustomers();
			} else if (e.action === 'update') {
				customers = customers.map(c => c.id === e.record.id ? e.record : c);
				if (selectedCustomer?.id === e.record.id) {
					selectedCustomer = e.record;
				}
				filterAndSortCustomers();
			} else if (e.action === 'delete') {
				customers = customers.filter(c => c.id !== e.record.id);
				filterAndSortCustomers();
			}
		}, { expand: '' });
	}

	// Filter and sort customers
	function filterAndSortCustomers() {
		let result = [...customers];

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(c => {
				const name = c.name?.toLowerCase() || '';
				const region = c.region?.toLowerCase() || '';
				const phone = c.phone?.toString().toLowerCase() || '';
				const customerType = c.customer_type?.toLowerCase() || '';
				return name.includes(query) || region.includes(query) || phone.includes(query) || customerType.includes(query);
			});
		}

		// Sort
		result.sort((a, b) => {
			let aVal: any;
			let bVal: any;

			if (sortBy === 'created') {
				aVal = new Date(a.created).getTime();
				bVal = new Date(b.created).getTime();
			} else if (sortBy === 'name') {
				aVal = a.name || '';
				bVal = b.name || '';
			} else if (sortBy === 'phone') {
				aVal = a.phone || '';
				bVal = b.phone || '';
			}

			if (sortOrder === 'asc') {
				return aVal > bVal ? 1 : -1;
			} else {
				return aVal < bVal ? 1 : -1;
			}
		});

		filteredCustomers = result;
	}

	// Create customer
	async function createCustomer() {
		if (!formData.name) {
			alert('Name is required');
			return;
		}

		try {
			loading = true;
			const newCustomer = await pb.collection('customers').create({
				name: formData.name,
				region: formData.region,
				address: formData.address,
				contact_person: formData.contact_person,
				phone: formData.phone ? parseInt(formData.phone) : null,
				customer_type: formData.customer_type
			});

			// Real-time subscription will handle the addition
			closeCreateModal();
		} catch (error) {
			console.error('Error creating customer:', error);
			alert('Failed to create customer');
		} finally {
			loading = false;
		}
	}

	// Update customer
	async function updateCustomer() {
		if (!formData.name) {
			alert('Name is required');
			return;
		}

		try {
			loading = true;
			const updatedCustomer = await pb.collection('customers').update(selectedCustomer.id, {
				name: formData.name,
				region: formData.region,
				address: formData.address,
				contact_person: formData.contact_person,
				phone: formData.phone ? parseInt(formData.phone) : null,
				customer_type: formData.customer_type
			});

			// Real-time subscription will handle the update
			closeEditModal();
		} catch (error) {
			console.error('Error updating customer:', error);
			alert('Failed to update customer');
		} finally {
			loading = false;
		}
	}

	// Delete customer
	async function deleteCustomer() {
		try {
			loading = true;
			await pb.collection('customers').delete(selectedCustomer.id);

			// Real-time subscription will handle the deletion
			closeDeleteConfirm();
		} catch (error) {
			console.error('Error deleting customer:', error);
			alert('Failed to delete customer');
		} finally {
			loading = false;
		}
	}

	// Modal functions
	function openCreateModal() {
		formData = {
			name: '',
			region: '',
			address: '',
			contact_person: '',
			phone: '',
			customer_type: 'General Trade'
		};
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function openEditModal(customer: any) {
		selectedCustomer = customer;
		formData = {
			name: customer.name,
			region: customer.region || '',
			address: customer.address || '',
			contact_person: customer.contact_person || '',
			phone: customer.phone ? customer.phone.toString() : '',
			customer_type: customer.customer_type || 'General Trade'
		};
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedCustomer = null;
	}

	function openDeleteConfirm(customer: any) {
		selectedCustomer = customer;
		showDeleteConfirm = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
		selectedCustomer = null;
	}

	onMount(() => {
		loadCustomers();
	});

	onDestroy(() => {
		// Unsubscribe from real-time updates when component is destroyed
		pb.collection('customers').unsubscribe('*');
	});

	$: if (searchQuery || sortBy || sortOrder) {
		filterAndSortCustomers();
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-8">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Customers</h1>
				<p class="text-gray-600 mt-1">Manage all your customers in one place</p>
			</div>
			<button
				on:click={openCreateModal}
				class="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Customer
			</button>
		</div>

		<!-- Search and Filter Bar -->
		<div class="bg-white rounded-lg shadow-sm p-4 mb-6">
			<div class="flex flex-col md:flex-row gap-4">
				<div class="flex-1">
					<input
						type="text"
						placeholder="Search by name, region, phone, or type..."
						bind:value={searchQuery}
						class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div class="flex gap-2">
					<select
						bind:value={sortBy}
						class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="created">Sort by Date</option>
						<option value="name">Sort by Name</option>
						<option value="phone">Sort by Phone</option>
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
		{#if loading}
			<div class="bg-white rounded-lg shadow-sm p-8 text-center">
				<div class="inline-block">
					<svg class="w-8 h-8 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
					</svg>
				</div>
				<p class="text-gray-600 mt-4">Loading customers...</p>
			</div>
		{:else if filteredCustomers.length === 0}
			<div class="bg-white rounded-lg shadow-sm p-12 text-center">
				<svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2H6v-2z" />
				</svg>
				<p class="text-gray-600 text-lg">No customers found</p>
				<p class="text-gray-500 mt-1">
					{searchQuery ? 'Try adjusting your search criteria' : 'Get started by adding a new customer'}
				</p>
			</div>
		{:else}
			<!-- Customers Table -->
			<div class="bg-white rounded-lg shadow-sm overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="bg-gray-50 border-b border-gray-200">
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Region</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Contact Person</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Phone</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Customer Type</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each filteredCustomers as customer (customer.id)}
								<tr class="hover:bg-gray-50 transition-colors cursor-pointer" on:click={() => viewCustomerDetails(customer)}>
									<td class="px-6 py-4 text-sm text-gray-900 font-medium">{customer.name}</td>
									<td class="px-6 py-4 text-sm text-gray-600">{customer.region || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-600">{customer.contact_person || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-600">{customer.phone || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-600">
										<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
											{customer.customer_type || '-'}
										</span>
									</td>
									<td class="px-6 py-4 text-sm" on:click|stopPropagation>
										<div class="flex gap-2">
											<button
												on:click={() => openEditModal(customer)}
												class="text-blue-600 hover:text-blue-900 font-medium transition-colors"
											>
												Edit
											</button>
											<button
												on:click={() => openDeleteConfirm(customer)}
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

	<!-- Create Modal -->
	{#if showCreateModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-white rounded-lg shadow-lg max-w-md w-full max-h-screen overflow-y-auto">
				<div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
					<h2 class="text-xl font-bold text-gray-900">Add New Customer</h2>
					<button
						on:click={closeCreateModal}
						class="text-gray-500 hover:text-gray-700 transition-colors"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<form on:submit|preventDefault={createCustomer} class="p-6 space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Name *</label>
						<input
							type="text"
							bind:value={formData.name}
							placeholder="Enter customer name"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Region</label>
						<input
							type="text"
							bind:value={formData.region}
							placeholder="Enter region"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Contact Person</label>
						<input
							type="text"
							bind:value={formData.contact_person}
							placeholder="Enter contact person name"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Phone</label>
						<input
							type="tel"
							bind:value={formData.phone}
							placeholder="Enter phone number"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Address</label>
						<input
							type="text"
							bind:value={formData.address}
							placeholder="Enter street address"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Customer Type</label>
						<select
							bind:value={formData.customer_type}
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each customerTypes as type}
								<option value={type}>{type}</option>
							{/each}
						</select>
					</div>
					<div class="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Creating...' : 'Create Customer'}
						</button>
						<button
							type="button"
							on:click={closeCreateModal}
							class="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
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
					<h2 class="text-xl font-bold text-gray-900">Edit Customer</h2>
					<button
						on:click={closeEditModal}
						class="text-gray-500 hover:text-gray-700 transition-colors"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<form on:submit|preventDefault={updateCustomer} class="p-6 space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Name *</label>
						<input
							type="text"
							bind:value={formData.name}
							placeholder="Enter customer name"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Region</label>
						<input
							type="text"
							bind:value={formData.region}
							placeholder="Enter region"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Contact Person</label>
						<input
							type="text"
							bind:value={formData.contact_person}
							placeholder="Enter contact person name"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Phone</label>
						<input
							type="tel"
							bind:value={formData.phone}
							placeholder="Enter phone number"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Address</label>
						<input
							type="text"
							bind:value={formData.address}
							placeholder="Enter street address"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-900 mb-1">Customer Type</label>
						<select
							bind:value={formData.customer_type}
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each customerTypes as type}
								<option value={type}>{type}</option>
							{/each}
						</select>
					</div>
					<div class="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Updating...' : 'Update Customer'}
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
					<h3 class="text-lg font-bold text-gray-900 text-center mb-2">Delete Customer</h3>
					<p class="text-gray-600 text-center mb-6">
						Are you sure you want to delete <span class="font-medium">{selectedCustomer?.name}</span>? This action cannot be undone.
					</p>
					<div class="flex gap-3">
						<button
							on:click={deleteCustomer}
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

	<!-- Customer Details Card Modal -->
	{#if showDetailCard && selectedCustomer}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 overflow-y-auto">
			<div class="bg-white rounded-lg shadow-2xl max-w-5xl w-full my-2">
				<!-- Hero Header -->
				<div class="relative bg-gradient-to-r from-blue-600 via-blue-700 to-purple-700 px-4 py-3 rounded-t-lg overflow-hidden">
					<div class="absolute top-0 right-0 opacity-10">
						<svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
						</svg>
					</div>
					<div class="relative z-10 flex items-start justify-between">
						<div>
							<h2 class="text-lg font-bold text-white mb-0.5">{selectedCustomer.name}</h2>
							<p class="text-blue-100 text-xs">{selectedCustomer.customer_type || 'Customer'}</p>
						</div>
						<button
							on:click={closeDetailCard}
							class="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1.5 transition-colors flex-shrink-0"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>

				<div class="p-3 space-y-2.5 max-h-[88vh] overflow-y-auto">
					<!-- Contact Information Section -->
					<div class="grid grid-cols-2 md:grid-cols-4 gap-1.5">
						<div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-2 border border-slate-200">
							<div class="flex items-center gap-1.5 mb-1">
								<svg class="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
									<path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
									<path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
								</svg>
								<p class="text-xs font-semibold text-gray-600 uppercase">Region</p>
							</div>
							<p class="text-xs font-bold text-gray-900 truncate">{selectedCustomer.region || '—'}</p>
						</div>

						<div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-2 border border-slate-200">
							<div class="flex items-center gap-1.5 mb-1">
								<svg class="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
									<path d="M3 8a3 3 0 013-3h2.5a1 1 0 00.82-.4l2.915-3.597a6 6 0 018.82 8.82l2.915 3.596a1 1 0 00.82.4H21a3 3 0 013 3V19a3 3 0 01-3 3H6a3 3 0 01-3-3V8z"/>
								</svg>
								<p class="text-xs font-semibold text-gray-600 uppercase">Phone</p>
							</div>
							<p class="text-xs font-bold text-gray-900 truncate">{selectedCustomer.phone || '—'}</p>
						</div>

						<div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-2 border border-slate-200">
							<div class="flex items-center gap-1.5 mb-1">
								<svg class="w-3.5 h-3.5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
									<path d="M18 9c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zm0 2c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm-6-5c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0-2c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm0 12c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zm0 2c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zM6 13c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm0-2c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1z"/>
								</svg>
								<p class="text-xs font-semibold text-gray-600 uppercase">Contact</p>
							</div>
							<p class="text-xs font-bold text-gray-900 truncate">{selectedCustomer.contact_person || '—'}</p>
						</div>

						<div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-2 border border-slate-200">
							<div class="flex items-center gap-1.5 mb-1">
								<svg class="w-3.5 h-3.5 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
									<path d="M12 1C6.48 1 2 5.48 2 11c0 5.03 3.71 9.26 8.55 9.9v-6.69h-2.5V12h2.5V9.8c0-2.47 1.45-3.83 3.75-3.83 1.09 0 2.23.2 2.23.2v2.45h-1.26c-1.24 0-1.62.77-1.62 1.56V12h2.77l-.44 2.21h-2.33v6.69C19.29 20.26 23 15.03 23 11c0-5.52-4.48-10-10-10z"/>
								</svg>
								<p class="text-xs font-semibold text-gray-600 uppercase">Address</p>
							</div>
							<p class="text-xs font-bold text-gray-900 truncate">{selectedCustomer.address || '—'}</p>
						</div>
					</div>

					<!-- KPI Cards -->
					{#if customerOrdersData}
						<div class="grid grid-cols-2 md:grid-cols-4 gap-1.5">
							<!-- Total Orders -->
							<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2 border border-blue-200 hover:border-blue-400 transition-all">
								<div class="flex items-center justify-between mb-1">
									<div class="bg-blue-200 rounded p-1">
										<svg class="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
										</svg>
									</div>
									<span class="text-xs font-semibold text-blue-600 bg-blue-200 px-1.5 py-0.5 rounded text-xxs">Total</span>
								</div>
								<p class="text-gray-600 text-xs font-medium mb-0.5">Orders</p>
								<p class="text-lg font-bold text-blue-900">{customerOrdersData.totalOrders}</p>
							</div>

							<!-- Total Bales -->
							<div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2 border border-green-200 hover:border-green-400 transition-all">
								<div class="flex items-center justify-between mb-1">
									<div class="bg-green-200 rounded p-1">
										<svg class="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M20 7l-8-4-8 4m0 0l8-4m8 4v10l-8 4m0-10L4 7m8 4v10m0-10l8 4m-8-4l-8-4"/>
										</svg>
									</div>
									<span class="text-xs font-semibold text-green-600 bg-green-200 px-1.5 py-0.5 rounded text-xxs">Bales</span>
								</div>
								<p class="text-gray-600 text-xs font-medium mb-0.5">Total Bales</p>
								<p class="text-lg font-bold text-green-900">{customerOrdersData.totalSpent}</p>
							</div>

							<!-- Average Order Value -->
							<div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-2 border border-purple-200 hover:border-purple-400 transition-all">
								<div class="flex items-center justify-between mb-1">
									<div class="bg-purple-200 rounded p-1">
										<svg class="w-3 h-3 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 7c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm0-14C6.48 1 2 5.48 2 12s4.48 11 10 11 10-4.48 10-10S17.52 1 12 1zm0 20c-4.97 0-9-4.03-9-9s4.03-9 9-9 9 4.03 9 9-4.03 9-9 9z"/>
										</svg>
									</div>
									<span class="text-xs font-semibold text-purple-600 bg-purple-200 px-1.5 py-0.5 rounded text-xxs">Avg</span>
								</div>
								<p class="text-gray-600 text-xs font-medium mb-0.5">Avg/Order</p>
								<p class="text-lg font-bold text-purple-900">{customerOrdersData.totalOrders > 0 ? Math.round(customerOrdersData.totalSpent / customerOrdersData.totalOrders) : 0}</p>
							</div>

							<!-- Last Order -->
							<div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2 border border-orange-200 hover:border-orange-400 transition-all">
								<div class="flex items-center justify-between mb-1">
									<div class="bg-orange-200 rounded p-1">
										<svg class="w-3 h-3 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
										</svg>
									</div>
									<span class="text-xs font-semibold text-orange-600 bg-orange-200 px-1.5 py-0.5 rounded text-xxs">Recent</span>
								</div>
								<p class="text-gray-600 text-xs font-medium mb-0.5">Last Order</p>
								<p class="text-lg font-bold text-orange-900">{customerOrdersData.orders.length > 0 ? new Date(customerOrdersData.orders[0].created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</p>
							</div>
						</div>

						<!-- Charts and Data Section -->
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
							<!-- Order Analysis Bar Chart -->
							<div class="bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 border border-blue-200 rounded-lg p-3 hover:border-blue-400 transition-all">
								<div class="flex items-center gap-2 mb-2">
									<div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded p-1">
										<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
											<path d="M3 13h2v8H3zm4-8h2v16H7zm4-2h2v18h-2zm4 4h2v14h-2zm4-2h2v16h-2z" />
										</svg>
									</div>
									<h3 class="text-xs font-bold text-gray-900">Order Analysis</h3>
									<span class="ml-auto text-xs text-blue-600 font-semibold">Last 6 Months</span>
								</div>
								{#if customerOrdersData.monthlyData && customerOrdersData.monthlyData.length > 0}
									{@const maxVal = Math.max(...customerOrdersData.monthlyData.map((d: MonthlyData) => d.count), 1)}
									<svg viewBox="0 0 400 100" class="w-full h-20">
										<defs>
											<linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
												<stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
												<stop offset="100%" style="stop-color:#1E40AF;stop-opacity:1" />
											</linearGradient>
										</defs>
										<!-- Grid lines -->
										<line x1="0" y1="25" x2="400" y2="25" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										<line x1="0" y1="50" x2="400" y2="50" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										<line x1="0" y1="75" x2="400" y2="75" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										
										<!-- Bars -->
										{#each customerOrdersData.monthlyData as point, i}
											<g>
												<rect
													x={15 + (i * 60)}
													y={80 - (point.count / maxVal) * 60}
													width="30"
													height={point.count / maxVal * 60 || 1}
													fill="url(#barGradient)"
													opacity="0.9"
													rx="2"
													class="hover:opacity-100 transition-opacity"
												/>
												<text
													x={30 + (i * 60)}
													y="95"
													text-anchor="middle"
													font-size="8"
													font-weight="600"
													fill="#64748B"
												>
													{point.month}
												</text>
											</g>
										{/each}
									</svg>
									<div class="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
										<div class="bg-blue-500 bg-opacity-10 border border-blue-200 rounded p-1">
											<p class="text-blue-700 font-medium text-xs">Peak</p>
											<p class="text-sm font-bold text-blue-900">{Math.max(...customerOrdersData.monthlyData.map((d: MonthlyData) => d.count), 0)}</p>
										</div>
										<div class="bg-blue-500 bg-opacity-10 border border-blue-200 rounded p-1">
											<p class="text-blue-700 font-medium text-xs">Avg</p>
											<p class="text-sm font-bold text-blue-900">{Math.round(customerOrdersData.monthlyData.reduce((sum: number, d: MonthlyData) => sum + d.count, 0) / customerOrdersData.monthlyData.length)}</p>
										</div>
										<div class="bg-blue-500 bg-opacity-10 border border-blue-200 rounded p-1">
											<p class="text-blue-700 font-medium text-xs">Total</p>
											<p class="text-sm font-bold text-blue-900">{customerOrdersData.monthlyData.reduce((sum: number, d: MonthlyData) => sum + d.count, 0)}</p>
										</div>
									</div>
								{:else}
									<div class="flex items-center justify-center h-20 text-gray-500 text-xs">
										<p>No order data available</p>
									</div>
								{/if}
							</div>

							<!-- Money Spent Line Chart -->
							<div class="bg-gradient-to-br from-slate-50 via-emerald-50 to-slate-50 border border-emerald-200 rounded-lg p-3 hover:border-emerald-400 transition-all">
								<div class="flex items-center gap-2 mb-2">
									<div class="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded p-1">
										<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
										</svg>
									</div>
									<h3 class="text-xs font-bold text-gray-900">Money Spent</h3>
									<span class="ml-auto text-xs text-emerald-600 font-semibold">Last 6 Months</span>
								</div>
								{#if customerOrdersData.monthlyData && customerOrdersData.monthlyData.length > 0}
									{@const monthlySpend = customerOrdersData.monthlyData.map((d: MonthlyData, idx: number) => {
										const totalSpendForMonth = customerOrdersData!.orders
											.filter((order: Order) => {
												const orderMonth = new Date(order.created).getMonth();
												const currentMonth = new Date().getMonth() - (5 - idx);
												return orderMonth === (currentMonth < 0 ? currentMonth + 12 : currentMonth);
											})
											.reduce((sum: number, order: Order) => sum + (order.quantity || 0), 0);
										return { month: d.month, spend: totalSpendForMonth };
									})}
									{@const maxSpend = Math.max(...monthlySpend.map((d: any) => d.spend), 1)}
									{@const spendPoints = monthlySpend.map((d: any, i: number) => {
										const x = 20 + (i * 60);
										const y = 80 - (d.spend / maxSpend) * 60;
										return `${x},${y}`;
									}).join(' ')}
									<svg viewBox="0 0 400 100" class="w-full h-20">
										<defs>
											<linearGradient id="spendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
												<stop offset="0%" style="stop-color:#10B981;stop-opacity:0.2" />
												<stop offset="100%" style="stop-color:#10B981;stop-opacity:0" />
											</linearGradient>
										</defs>
										<!-- Grid lines -->
										<line x1="0" y1="25" x2="400" y2="25" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										<line x1="0" y1="50" x2="400" y2="50" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										<line x1="0" y1="75" x2="400" y2="75" stroke="#E5E7EB" stroke-width="0.5" stroke-dasharray="2" />
										
										<!-- Area fill -->
										<polygon points="{spendPoints} 380,80 20,80" fill="url(#spendGradient)" />
										
										<!-- Line -->
										<polyline points="{spendPoints}" fill="none" stroke="#10B981" stroke-width="1.5" />
										
										<!-- Points -->
										{#each monthlySpend as point, i}
											<circle
												cx={20 + (i * 60)}
												cy={80 - (point.spend / maxSpend) * 60}
												r="2"
												fill="#10B981"
												stroke="#fff"
												stroke-width="1"
											/>
											<text
												x={20 + (i * 60)}
												y="95"
												text-anchor="middle"
												font-size="8"
												font-weight="600"
												fill="#64748B"
											>
												{point.month}
											</text>
										{/each}
									</svg>
									<div class="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
										<div class="bg-emerald-500 bg-opacity-10 border border-emerald-200 rounded p-1">
											<p class="text-emerald-700 font-medium text-xs">Peak</p>
											<p class="text-sm font-bold text-emerald-900">{Math.max(...monthlySpend.map((d: any) => d.spend), 0)}</p>
										</div>
										<div class="bg-emerald-500 bg-opacity-10 border border-emerald-200 rounded p-1">
											<p class="text-emerald-700 font-medium text-xs">Avg</p>
											<p class="text-sm font-bold text-emerald-900">{Math.round(monthlySpend.reduce((sum: number, d: any) => sum + d.spend, 0) / monthlySpend.length)}</p>
										</div>
										<div class="bg-emerald-500 bg-opacity-10 border border-emerald-200 rounded p-1">
											<p class="text-emerald-700 font-medium text-xs">Total</p>
											<p class="text-sm font-bold text-emerald-900">{monthlySpend.reduce((sum: number, d: any) => sum + d.spend, 0)}</p>
										</div>
									</div>
								{:else}
									<div class="flex items-center justify-center h-20 text-gray-500 text-xs">
										<p>No spending data</p>
									</div>
								{/if}
							</div>
						</div>

						<!-- Recent Orders Table -->
						<div class="bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition-all">
							<div class="flex items-center gap-2 mb-2">
								<div class="bg-green-100 rounded p-1">
									<svg class="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 24 24">
										<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
									</svg>
								</div>
								<h3 class="text-xs font-bold text-gray-900">Recent Orders</h3>
								<span class="ml-auto text-xs text-gray-500">{customerOrdersData.orders.length}</span>
							</div>
							{#if customerOrdersData.orders.length > 0}
								<div class="space-y-1 max-h-32 overflow-y-auto">
									{#each customerOrdersData.orders as order, idx}
										<div class="flex items-center justify-between p-1.5 bg-gray-50 rounded border border-gray-100 hover:border-gray-300 transition-all">
											<div class="flex items-center gap-1.5 flex-1 min-w-0">
												<div class="flex-shrink-0">
													<div class="flex items-center justify-center h-6 w-6 rounded bg-blue-100 text-xs font-bold text-blue-600">
														{idx + 1}
													</div>
												</div>
												<div class="flex-1 min-w-0">
													<p class="text-xs font-semibold text-gray-900 truncate">#{ order.id.substring(0, 8).toUpperCase()}</p>
													<p class="text-xs text-gray-500">{new Date(order.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
												</div>
											</div>
											<div class="flex-shrink-0 ml-1">
												<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold {order.status === 'Processed' ? 'bg-green-100 text-green-800' : order.status === 'Dispatched' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">
													{order.status}
												</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="flex items-center justify-center h-16 text-gray-500 text-xs">
									<p>No orders</p>
								</div>
							{/if}
						</div>
					{:else}
						<div class="flex items-center justify-center h-32">
							<div class="inline-block">
								<svg class="w-6 h-6 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
								</svg>
							</div>
							<p class="text-gray-600 ml-2 text-xs">Loading...</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
