<script lang="ts">
	import pb from '$lib/pocketbase';
	let activeTab: string = 'customers';
	let loading: boolean = false;
	let message: string = '';
	let messageType: string = '';

	const tables = [
		{ id: 'customers', name: 'Customers', collectionId: 'k28kgicvk6pnwet' },
		{ id: 'orders', name: 'Orders', collectionId: '8j4uex7zh9tqlxr' },
		{ id: 'order_items', name: 'Order Items', collectionId: 'ryyci4ny91sfvqh' },
		{ id: 'products', name: 'Products', collectionId: 'kj3n8s7d0u579o7' }
	];

	let jsonInputs: Record<string, string> = {
		customers: '',
		orders: '',
		order_items: '',
		products: ''
	};

	const showMessage = (text: string, type: string): void => {
		message = text;
		messageType = type;
		setTimeout(() => {
			message = '';
		}, 5000);
	};

	const parseAndValidateJSON = (jsonString: string): unknown[] => {
		try {
			const parsed = JSON.parse(jsonString);
			if (Array.isArray(parsed)) {
				return parsed;
			}
			return [parsed];
		} catch (error) {
			const err = error as Error;
			throw new Error(`Invalid JSON: ${err.message}`);
		}
	};

	const uploadJSON = async (): Promise<void> => {
		if (!jsonInputs[activeTab].trim()) {
			showMessage('Please enter JSON data', 'error');
			return;
		}

		loading = true;
		try {
			const records = parseAndValidateJSON(jsonInputs[activeTab]);
			const table = tables.find(t => t.id === activeTab);

			let successCount = 0;
			let errorCount = 0;
			const errors: string[] = [];

			for (const record of records) {
				const typedRecord = record as Record<string, unknown>;
				
				// Check if this is a combined order format (has "items" array)
				const hasItems = Array.isArray(typedRecord.items) && typedRecord.items.length > 0;
				const isOrdersTab = activeTab === 'orders';
				
				if (hasItems && isOrdersTab) {
					// Handle combined format: order + items
					try {
						// Extract order data (remove items, customer_name, product_name, product_size)
						const { items, customer_name, product_name, product_size, collectionId, collectionName, created, updated, id, ...orderData } = typedRecord;
						
						// Create the order first
						let orderId: string;
						if (typedRecord.id) {
							// Update existing order
							await pb.collection('orders').update(typedRecord.id as string, orderData);
							orderId = typedRecord.id as string;
						} else {
							// Create new order
							const newOrder = await pb.collection('orders').create(orderData);
							orderId = newOrder.id;
						}
						
						// Create order items
						const orderItems = items as Array<Record<string, unknown>>;
						let itemsSuccess = 0;
						let itemsError = 0;
						
						for (const item of orderItems) {
							try {
								const { product_name, product_size, ...itemData } = item;
								// Add the order ID to the item
								const orderItemData = {
									...itemData,
									order: orderId
								};
								
								await pb.collection('order_items').create(orderItemData);
								itemsSuccess++;
							} catch (itemError) {
								itemsError++;
								const itemName = (item.product_name || item.product || 'item') as string;
								console.error(`Error creating order item "${itemName}":`, itemError);
							}
						}
						
						if (itemsError === 0) {
							successCount++;
						} else {
							errorCount++;
							const recordName = typedRecord.customer_name || typedRecord.customer || `Order ${successCount + errorCount}`;
							errors.push(`${recordName}: Order created but ${itemsError} item(s) failed`);
						}
					} catch (error) {
						errorCount++;
						const recordName = typedRecord.customer_name || typedRecord.customer || `Record ${successCount + errorCount}`;
						
						// Extract detailed error information from PocketBase
						let errorMessage = 'Unknown error';
						
						if (error?.response) {
							const response = error.response;
							if (response.data) {
								const fieldErrors: string[] = [];
								for (const [field, message] of Object.entries(response.data)) {
									if (Array.isArray(message)) {
										fieldErrors.push(`${field}: ${message.join(', ')}`);
									} else if (typeof message === 'string') {
										fieldErrors.push(`${field}: ${message}`);
									} else {
										fieldErrors.push(`${field}: ${JSON.stringify(message)}`);
									}
								}
								if (fieldErrors.length > 0) {
									errorMessage = fieldErrors.join('; ');
								} else {
									errorMessage = response.message || error.message || 'Validation failed';
								}
							} else {
								errorMessage = response.message || error.message || 'Failed to create record';
							}
						} else if (error?.message) {
							errorMessage = error.message;
						}
						
						errors.push(`${recordName}: ${errorMessage}`);
						console.error(`Error processing combined order "${recordName}":`, error);
					}
				} else {
					// Handle regular format (single record)
					// Remove system fields if they exist
					const { collectionId, collectionName, created, updated, id, customer_name, product_name, product_size, items, ...data } = typedRecord;

					try {
						// Try to update if ID exists
						if (typedRecord.id) {
							await pb.collection(activeTab).update(typedRecord.id as string, data);
							successCount++;
						} else {
							// Create new record
							await pb.collection(activeTab).create(data);
							successCount++;
						}
					} catch (error) {
						errorCount++;
						const recordName = typedRecord.name || typedRecord.id || `Record ${successCount + errorCount}`;
						
						// Extract detailed error information from PocketBase
						let errorMessage = 'Unknown error';
						
						if (error?.response) {
							// PocketBase error structure
							const response = error.response;
							
							// Check for field-specific validation errors
							if (response.data) {
								const fieldErrors: string[] = [];
								for (const [field, message] of Object.entries(response.data)) {
									if (Array.isArray(message)) {
										fieldErrors.push(`${field}: ${message.join(', ')}`);
									} else if (typeof message === 'string') {
										fieldErrors.push(`${field}: ${message}`);
									} else {
										fieldErrors.push(`${field}: ${JSON.stringify(message)}`);
									}
								}
								if (fieldErrors.length > 0) {
									errorMessage = fieldErrors.join('; ');
								} else {
									errorMessage = response.message || error.message || 'Validation failed';
								}
							} else {
								errorMessage = response.message || error.message || 'Failed to create record';
							}
						} else if (error?.message) {
							errorMessage = error.message;
						}
						
						errors.push(`${recordName}: ${errorMessage}`);
						console.error(`Error processing record "${recordName}":`, error);
						console.error('Full error object:', JSON.stringify(error, null, 2));
						// Continue processing other records instead of stopping
					}
				}
			}

			if (errorCount > 0) {
				const errorMsg = `Failed to create ${errorCount} record(s). ${successCount > 0 ? `Successfully created ${successCount} record(s). ` : ''}Errors: ${errors.join('; ')}`;
				showMessage(errorMsg, 'error');
			} else {
				showMessage(`Successfully uploaded ${records.length} record(s) to ${table?.name}`, 'success');
				jsonInputs[activeTab] = '';
			}

		} catch (error) {
			const err = error as Error;
			const errorMessage = error?.response?.message || error?.message || err.message || 'Unknown error occurred';
			showMessage(`Error: ${errorMessage}`, 'error');
		} finally {
			loading = false;
		}
	};

	const exportTable = async (): Promise<void> => {
		try {
			loading = true;
			const records = await pb.collection(activeTab).getFullList({
				batch: 100
			});

			jsonInputs[activeTab] = JSON.stringify(records, null, 2);
			showMessage(`Exported ${records.length} record(s)`, 'success');
		} catch (error) {
			const err = error as Error;
			showMessage(`Error exporting: ${err.message}`, 'error');
		} finally {
			loading = false;
		}
	};

	// Helper function to get customer ID by name (for orders tab)
	const lookupCustomerId = async (customerName: string): Promise<string | null> => {
		try {
			const customers = await pb.collection('customers').getList(1, 1, {
				filter: `name = "${customerName}"`
			});
			return customers.items.length > 0 ? customers.items[0].id : null;
		} catch (error) {
			console.error('Error looking up customer:', error);
			return null;
		}
	};

	// Helper function to get product ID by name and size
	const lookupProductId = async (productName: string, productSize: string = ''): Promise<string | null> => {
		try {
			let filter = `name = "${productName}"`;
			if (productSize) {
				filter += ` && size = "${productSize}"`;
			} else {
				filter += ` && (size = "" || size = null)`;
			}
			const products = await pb.collection('products').getList(1, 1, {
				filter: filter
			});
			return products.items.length > 0 ? products.items[0].id : null;
		} catch (error) {
			console.error('Error looking up product:', error);
			return null;
		}
	};

	// Enhanced upload that can auto-lookup IDs by name
	const uploadJSONWithLookup = async (): Promise<void> => {
		if (!jsonInputs[activeTab].trim()) {
			showMessage('Please enter JSON data', 'error');
			return;
		}

		loading = true;
		try {
			const records = parseAndValidateJSON(jsonInputs[activeTab]);
			const table = tables.find(t => t.id === activeTab);

			let successCount = 0;
			let errorCount = 0;
			const errors: string[] = [];

			// If orders tab and has customer_name, try to lookup IDs
			if (activeTab === 'orders') {
				for (const record of records) {
					const typedRecord = record as Record<string, unknown>;
					
					// If customer_name exists but customer is a placeholder, try to lookup
					if (typedRecord.customer_name && 
						(!typedRecord.customer || (typedRecord.customer as string).startsWith('customer_id_'))) {
						const customerName = typedRecord.customer_name as string;
						const customerId = await lookupCustomerId(customerName);
						if (customerId) {
							typedRecord.customer = customerId;
							console.log(`Found customer ID for "${customerName}": ${customerId}`);
						} else {
							errorCount++;
							errors.push(`${customerName}: Customer not found in database`);
							continue;
						}
					}

					// If items exist, try to lookup product IDs
					if (Array.isArray(typedRecord.items)) {
						for (const item of typedRecord.items as Array<Record<string, unknown>>) {
							if (item.product_name && 
								(!item.product || (item.product as string).startsWith('product_id_'))) {
								const productName = item.product_name as string;
								const productSize = (item.product_size as string) || '';
								const productId = await lookupProductId(productName, productSize);
								if (productId) {
									item.product = productId;
									console.log(`Found product ID for "${productName}" ${productSize}: ${productId}`);
								} else {
									console.warn(`Product not found: "${productName}" size: "${productSize}"`);
								}
							}
						}
					}
				}
			}

			// Now proceed with normal upload
			for (const record of records) {
				const typedRecord = record as Record<string, unknown>;
				
				// Check if this is a combined order format (has "items" array)
				const hasItems = Array.isArray(typedRecord.items) && typedRecord.items.length > 0;
				const isOrdersTab = activeTab === 'orders';
				
				if (hasItems && isOrdersTab) {
					// Handle combined format: order + items
					try {
						// Extract order data (remove items, customer_name, product_name, product_size)
						const { items, customer_name, product_name, product_size, collectionId, collectionName, created, updated, id, ...orderData } = typedRecord;
						
						// Create the order first
						let orderId: string;
						if (typedRecord.id) {
							// Update existing order
							await pb.collection('orders').update(typedRecord.id as string, orderData);
							orderId = typedRecord.id as string;
						} else {
							// Create new order
							const newOrder = await pb.collection('orders').create(orderData);
							orderId = newOrder.id;
						}
						
						// Create order items
						const orderItems = items as Array<Record<string, unknown>>;
						let itemsSuccess = 0;
						let itemsError = 0;
						
						for (const item of orderItems) {
							try {
								const { product_name, product_size, ...itemData } = item;
								// Add the order ID to the item
								const orderItemData = {
									...itemData,
									order: orderId
								};
								
								await pb.collection('order_items').create(orderItemData);
								itemsSuccess++;
							} catch (itemError) {
								itemsError++;
								const itemName = (item.product_name || item.product || 'item') as string;
								console.error(`Error creating order item "${itemName}":`, itemError);
							}
						}
						
						if (itemsError === 0) {
							successCount++;
						} else {
							errorCount++;
							const recordName = typedRecord.customer_name || typedRecord.customer || `Order ${successCount + errorCount}`;
							errors.push(`${recordName}: Order created but ${itemsError} item(s) failed`);
						}
					} catch (error) {
						errorCount++;
						const recordName = typedRecord.customer_name || typedRecord.customer || `Record ${successCount + errorCount}`;
						
						// Extract detailed error information from PocketBase
						let errorMessage = 'Unknown error';
						
						if (error?.response) {
							const response = error.response;
							if (response.data) {
								const fieldErrors: string[] = [];
								for (const [field, message] of Object.entries(response.data)) {
									if (Array.isArray(message)) {
										fieldErrors.push(`${field}: ${message.join(', ')}`);
									} else if (typeof message === 'string') {
										fieldErrors.push(`${field}: ${message}`);
									} else {
										fieldErrors.push(`${field}: ${JSON.stringify(message)}`);
									}
								}
								if (fieldErrors.length > 0) {
									errorMessage = fieldErrors.join('; ');
								} else {
									errorMessage = response.message || error.message || 'Validation failed';
								}
							} else {
								errorMessage = response.message || error.message || 'Failed to create record';
							}
						} else if (error?.message) {
							errorMessage = error.message;
						}
						
						errors.push(`${recordName}: ${errorMessage}`);
						console.error(`Error processing combined order "${recordName}":`, error);
					}
				} else {
					// Handle regular format (single record)
					// Remove system fields if they exist
					const { collectionId, collectionName, created, updated, id, customer_name, product_name, product_size, items, ...data } = typedRecord;

					try {
						// Try to update if ID exists
						if (typedRecord.id) {
							await pb.collection(activeTab).update(typedRecord.id as string, data);
							successCount++;
						} else {
							// Create new record
							await pb.collection(activeTab).create(data);
							successCount++;
						}
					} catch (error) {
						errorCount++;
						const recordName = typedRecord.name || typedRecord.customer_name || typedRecord.id || `Record ${successCount + errorCount}`;
						
						// Extract detailed error information from PocketBase
						let errorMessage = 'Unknown error';
						
						if (error?.response) {
							const response = error.response;
							if (response.data) {
								const fieldErrors: string[] = [];
								for (const [field, message] of Object.entries(response.data)) {
									if (Array.isArray(message)) {
										fieldErrors.push(`${field}: ${message.join(', ')}`);
									} else if (typeof message === 'string') {
										fieldErrors.push(`${field}: ${message}`);
									} else {
										fieldErrors.push(`${field}: ${JSON.stringify(message)}`);
									}
								}
								if (fieldErrors.length > 0) {
									errorMessage = fieldErrors.join('; ');
								} else {
									errorMessage = response.message || error.message || 'Validation failed';
								}
							} else {
								errorMessage = response.message || error.message || 'Failed to create record';
							}
						} else if (error?.message) {
							errorMessage = error.message;
						}
						
						errors.push(`${recordName}: ${errorMessage}`);
						console.error(`Error processing record "${recordName}":`, error);
						console.error('Full error object:', JSON.stringify(error, null, 2));
					}
				}
			}

			if (errorCount > 0) {
				const errorMsg = `Failed to create ${errorCount} record(s). ${successCount > 0 ? `Successfully created ${successCount} record(s). ` : ''}Errors: ${errors.join('; ')}`;
				showMessage(errorMsg, 'error');
			} else {
				showMessage(`Successfully uploaded ${records.length} record(s) to ${table?.name}`, 'success');
				jsonInputs[activeTab] = '';
			}

		} catch (error) {
			const err = error as Error;
			const errorMessage = error?.response?.message || error?.message || err.message || 'Unknown error occurred';
			showMessage(`Error: ${errorMessage}`, 'error');
		} finally {
			loading = false;
		}
	};

	const clearInput = (): void => {
		if (confirm('Are you sure you want to clear this input?')) {
			jsonInputs[activeTab] = '';
		}
	};

	const copyToClipboard = async (): Promise<void> => {
		try {
			await navigator.clipboard.writeText(jsonInputs[activeTab]);
			showMessage('Copied to clipboard!', 'success');
		} catch (error) {
			showMessage('Failed to copy', 'error');
		}
	};
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-6">
	<div class="max-w-6xl mx-auto">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-bold text-gray-900 mb-2">JSON Management</h1>
			<p class="text-gray-600">
				Upload or export JSON data for your tables. You can paste JSON records and update them to the database in real-time.
			</p>
		</div>

		<!-- Message Alert -->
		{#if message}
			<div
				class="mb-4 p-4 rounded-lg border {messageType === 'success'
					? 'bg-emerald-50 border-emerald-200 text-emerald-900'
					: 'bg-red-50 border-red-200 text-red-900'}"
			>
				{message}
			</div>
		{/if}

		<!-- Tabs -->
		<div class="flex gap-2 mb-6 overflow-x-auto">
			{#each tables as table}
				<button
					on:click={() => (activeTab = table.id)}
					class="px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap {activeTab === table.id
						? 'bg-blue-600 text-white shadow-md'
						: 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300'}"
				>
					{table.name}
				</button>
			{/each}
		</div>

		<!-- Main Content -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- JSON Input Area -->
			<div class="lg:col-span-2">
				<div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-full">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-lg font-semibold text-gray-900">
							{tables.find(t => t.id === activeTab)?.name} JSON
						</h2>
						<div class="text-xs text-gray-500">
							{jsonInputs[activeTab].length} characters
						</div>
					</div>

					<textarea
						bind:value={jsonInputs[activeTab]}
						placeholder={`Paste your JSON array or object here. Example:\n[\n  {\n    "name": "John",\n    "email": "john@example.com"\n  }\n]`}
						class="w-full h-96 p-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
					></textarea>

					<div class="mt-3 flex gap-2 flex-wrap">
						<button
							on:click={activeTab === 'orders' ? uploadJSONWithLookup : uploadJSON}
							disabled={loading}
							class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
						>
							{loading ? 'Uploading...' : 'Upload to DB'}
						</button>
						<button
							on:click={exportTable}
							disabled={loading}
							class="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
						>
							{loading ? 'Exporting...' : 'Export Table'}
						</button>
						<button
							on:click={copyToClipboard}
							disabled={!jsonInputs[activeTab].trim()}
							class="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
							title="Copy JSON to clipboard"
						>
							Copy
						</button>
						<button
							on:click={clearInput}
							class="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
						>
							Clear
						</button>
					</div>
				</div>
			</div>

			<!-- Info Panel -->
			<div class="space-y-4">
				<!-- Collection Info -->
				<div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
					<h3 class="text-sm font-semibold text-gray-900 mb-3">Collection Info</h3>
					{#each tables as table}
						{#if table.id === activeTab}
							<div class="space-y-2 text-sm">
								<div>
									<p class="text-gray-500">Name</p>
									<p class="font-mono text-gray-900 break-all">{table.name}</p>
								</div>
								<div>
									<p class="text-gray-500">ID</p>
									<p class="font-mono text-gray-900 text-xs break-all">{table.collectionId}</p>
								</div>
							</div>
						{/if}
					{/each}
				</div>

				<!-- Instructions -->
				<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
					<h3 class="text-sm font-semibold text-blue-900 mb-2">Instructions</h3>
					<ol class="text-xs text-blue-800 space-y-1 list-decimal list-inside">
						<li>Select a table from the tabs above</li>
						<li>Paste JSON array or object in the text area</li>
						<li>Click "Upload to DB" to save records</li>
						<li>Click "Export Table" to download all records</li>
						<li>System fields (id, collectionId, etc) are ignored on upload</li>
						{#if activeTab === 'orders'}
							<li class="mt-2 font-semibold">💡 Tip: Use combined format with "items" array to upload orders and items together!</li>
							<li class="mt-1 text-blue-700">💡 Auto-lookup: If you use "customer_name" instead of "customer" ID, the system will try to find the customer automatically!</li>
						{/if}
					</ol>
				</div>

				<!-- JSON Format Guide -->
				<div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
					<h3 class="text-sm font-semibold text-amber-900 mb-2">JSON Format</h3>
					<p class="text-xs text-amber-800 mb-2">Array of objects:</p>
					<pre class="text-xs bg-white p-2 rounded border border-amber-200 overflow-auto max-h-32"><code>{`[
  {
    "field1": "value1",
    "field2": "value2"
  }
]`}</code></pre>
				</div>

				<!-- Quick Stats -->
				<div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
					<h3 class="text-sm font-semibold text-gray-900 mb-2">Stats</h3>
					<div class="text-xs text-gray-600 space-y-1">
						<p>Current input: <span class="font-semibold">{jsonInputs[activeTab].length} chars</span></p>
						<p>Active table: <span class="font-semibold">{tables.find(t => t.id === activeTab)?.name}</span></p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	textarea {
		font-family: 'Courier New', Courier, monospace;
	}

	::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	::-webkit-scrollbar-track {
		background: #f1f5f9;
	}

	::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}
</style>
