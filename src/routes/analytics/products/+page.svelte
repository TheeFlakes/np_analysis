<script lang="ts">
	import { onMount } from 'svelte';
	import pb from '$lib/pocketbase';
	import { products } from '$lib/stores/dataStore';

	// State - using stores for data
	let localProducts: any[] = [];
	let filteredProducts: any[] = [];
	let loading = false;
	let searchQuery = '';
	let sortBy = 'created'; // 'created', 'name', 'price'
	let sortOrder = 'desc'; // 'asc', 'desc'
	
	// Subscribe to stores
	products.subscribe(value => {
		localProducts = value;
	});

	// Modal States
	let showCreateModal = false;
	let showEditModal = false;
	let showDeleteConfirm = false;
	let selectedProduct: any = null;

	// Form Data
	let formData = {
		name: '',
		size: '',
		description: '',
		price: ''
	};

	// Load products - data is already loaded from store
	function loadProducts() {
		loading = true;
		filterAndSortProducts();
		loading = false;
	}

	// Filter and sort products
	function filterAndSortProducts() {
		let result = [...localProducts];

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			result = result.filter(p => {
				const name = p.name?.toLowerCase() || '';
				const size = p.size?.toLowerCase() || '';
				const description = p.description?.toLowerCase() || '';
				return name.includes(query) || size.includes(query) || description.includes(query);
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
			} else if (sortBy === 'price') {
				aVal = parseFloat(a.price) || 0;
				bVal = parseFloat(b.price) || 0;
			}

			if (sortOrder === 'asc') {
				return aVal > bVal ? 1 : -1;
			} else {
				return aVal < bVal ? 1 : -1;
			}
		});

		filteredProducts = result;
	}

	// Create product
	async function createProduct() {
		if (!formData.name) {
			alert('Name is required');
			return;
		}

		if (!formData.price || parseFloat(formData.price) <= 0) {
			alert('Please enter a valid price');
			return;
		}

		try {
			loading = true;
			await pb.collection('products').create({
				name: formData.name,
				size: formData.size,
				description: formData.description,
				price: parseFloat(formData.price)
			});

			// Real-time subscription will handle the addition
			closeCreateModal();
		} catch (error) {
			console.error('Error creating product:', error);
			alert('Failed to create product');
		} finally {
			loading = false;
		}
	}

	// Update product
	async function updateProduct() {
		if (!formData.name) {
			alert('Name is required');
			return;
		}

		if (!formData.price || parseFloat(formData.price) <= 0) {
			alert('Please enter a valid price');
			return;
		}

		try {
			loading = true;
			await pb.collection('products').update(selectedProduct.id, {
				name: formData.name,
				size: formData.size,
				description: formData.description,
				price: parseFloat(formData.price)
			});

			// Real-time subscription will handle the update
			closeEditModal();
		} catch (error) {
			console.error('Error updating product:', error);
			alert('Failed to update product');
		} finally {
			loading = false;
		}
	}

	// Delete product
	async function deleteProduct() {
		try {
			loading = true;
			await pb.collection('products').delete(selectedProduct.id);

			// Real-time subscription will handle the deletion
			closeDeleteConfirm();
		} catch (error) {
			console.error('Error deleting product:', error);
			alert('Failed to delete product');
		} finally {
			loading = false;
		}
	}

	// Modal functions
	function openCreateModal() {
		formData = {
			name: '',
			size: '',
			description: '',
			price: ''
		};
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function openEditModal(product: any) {
		selectedProduct = product;
		formData = {
			name: product.name || '',
			size: product.size || '',
			description: product.description || '',
			price: product.price ? product.price.toString() : ''
		};
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedProduct = null;
	}

	function openDeleteConfirm(product: any) {
		selectedProduct = product;
		showDeleteConfirm = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
		selectedProduct = null;
	}

	onMount(() => {
		loadProducts();
	});

	// Reactive statement: filter when data or filters change
	$: if (localProducts.length >= 0) {
		filterAndSortProducts();
	}

	$: if (searchQuery !== undefined || sortBy !== undefined || sortOrder !== undefined) {
		filterAndSortProducts();
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-8">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Products</h1>
				<p class="text-gray-600 mt-1">Manage all your products in one place</p>
			</div>
			<button
				on:click={openCreateModal}
				class="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Product
			</button>
		</div>

		<!-- Search and Filter Bar -->
		<div class="bg-white rounded-lg shadow-sm p-4 mb-6">
			<div class="flex flex-col md:flex-row gap-4">
				<div class="flex-1">
					<input
						type="text"
						placeholder="Search by name, size, or description..."
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
						<option value="price">Sort by Price</option>
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
		{#if loading && filteredProducts.length === 0}
			<div class="bg-white rounded-lg shadow-sm p-8 text-center">
				<div class="inline-block">
					<svg class="w-8 h-8 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
					</svg>
				</div>
				<p class="text-gray-600 mt-4">Loading products...</p>
			</div>
		{:else if filteredProducts.length === 0}
			<div class="bg-white rounded-lg shadow-sm p-12 text-center">
				<svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m0 0l8-4m8 4v10l-8 4m0-10L4 7m8 4v10m0-10l8 4m-8-4l-8-4" />
				</svg>
				<p class="text-gray-600 text-lg">No products found</p>
				<p class="text-gray-500 mt-1">
					{searchQuery ? 'Try adjusting your search criteria' : 'Get started by adding a new product'}
				</p>
			</div>
		{:else}
			<!-- Products Table -->
			<div class="bg-white rounded-lg shadow-sm overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="bg-gray-50 border-b border-gray-200">
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Size</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Price</th>
								<th class="px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each filteredProducts as product (product.id)}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="px-6 py-4 text-sm text-gray-900 font-medium">{product.name}</td>
									<td class="px-6 py-4 text-sm text-gray-600">{product.size || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-600 max-w-md truncate">{product.description || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-900 font-semibold">
										Ksh {parseFloat(product.price || 0).toFixed(2)}
									</td>
									<td class="px-6 py-4 text-sm">
										<div class="flex gap-2">
											<button
												on:click={() => openEditModal(product)}
												class="text-blue-600 hover:text-blue-900 font-medium transition-colors"
											>
												Edit
											</button>
											<button
												on:click={() => openDeleteConfirm(product)}
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
					<h2 class="text-xl font-bold text-gray-900">Add New Product</h2>
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
				<form on:submit|preventDefault={createProduct} class="p-6 space-y-4">
					<div>
						<label for="create-name" class="block text-sm font-medium text-gray-900 mb-1">Name *</label>
						<input
							id="create-name"
							type="text"
							bind:value={formData.name}
							placeholder="Enter product name"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="create-size" class="block text-sm font-medium text-gray-900 mb-1">Size</label>
						<input
							id="create-size"
							type="text"
							bind:value={formData.size}
							placeholder="Enter product size (e.g., 2kg)"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="create-description" class="block text-sm font-medium text-gray-900 mb-1">Description</label>
						<textarea
							id="create-description"
							bind:value={formData.description}
							placeholder="Enter product description"
							rows="3"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						></textarea>
					</div>
					<div>
						<label for="create-price" class="block text-sm font-medium text-gray-900 mb-1">Price *</label>
						<input
							id="create-price"
							type="number"
							step="0.01"
							min="0"
							bind:value={formData.price}
							placeholder="Enter price"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Creating...' : 'Create Product'}
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
					<h2 class="text-xl font-bold text-gray-900">Edit Product</h2>
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
				<form on:submit|preventDefault={updateProduct} class="p-6 space-y-4">
					<div>
						<label for="edit-name" class="block text-sm font-medium text-gray-900 mb-1">Name *</label>
						<input
							id="edit-name"
							type="text"
							bind:value={formData.name}
							placeholder="Enter product name"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="edit-size" class="block text-sm font-medium text-gray-900 mb-1">Size</label>
						<input
							id="edit-size"
							type="text"
							bind:value={formData.size}
							placeholder="Enter product size (e.g., 2kg)"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label for="edit-description" class="block text-sm font-medium text-gray-900 mb-1">Description</label>
						<textarea
							id="edit-description"
							bind:value={formData.description}
							placeholder="Enter product description"
							rows="3"
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						></textarea>
					</div>
					<div>
						<label for="edit-price" class="block text-sm font-medium text-gray-900 mb-1">Price *</label>
						<input
							id="edit-price"
							type="number"
							step="0.01"
							min="0"
							bind:value={formData.price}
							placeholder="Enter price"
							required
							class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div class="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={loading}
							class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							{loading ? 'Updating...' : 'Update Product'}
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
					<h3 class="text-lg font-bold text-gray-900 text-center mb-2">Delete Product</h3>
					<p class="text-gray-600 text-center mb-6">
						Are you sure you want to delete <span class="font-medium">{selectedProduct?.name}</span>? This action cannot be undone.
					</p>
					<div class="flex gap-3">
						<button
							on:click={deleteProduct}
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
</div>
