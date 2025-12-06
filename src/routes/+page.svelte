<script lang="ts">
	import { goto } from '$app/navigation';

	function navigateToDashboard() {
		goto('/analytics');
	}
</script>

<div class="min-h-screen relative flex items-center justify-center overflow-hidden">
	<!-- Background Image with Overlay -->
	<div 
		class="absolute inset-0 bg-cover bg-center bg-no-repeat"
		style="background-image: url('/lea_page.jpg');"
	>
		<!-- Dark overlay for better text readability -->
		<div class="absolute inset-0 bg-black/40"></div>
	</div>

	<!-- Main Content -->
	<div class="relative z-10 w-full px-4 sm:px-6 lg:px-8 flex items-center justify-center min-h-screen">
		<div class="w-full max-w-md text-center">
			<!-- SVG Button -->
			<button
				on:click={navigateToDashboard}
				class="group relative mx-auto block focus:outline-none focus:ring-4 focus:ring-white/50 rounded-xl transition-all duration-300 active:scale-95"
				aria-label="Navigate to Orders Analytics Dashboard"
			>
				<!-- Button Background with Glass Effect -->
				<div class="relative bg-white/90 backdrop-blur-md rounded-xl p-2 sm:p-3 shadow-2xl border border-white/20">
					<!-- SVG Icon -->
					<div class="mb-2 flex justify-center">
						<svg 
							class="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 transition-transform duration-300 group-hover:rotate-3" 
							fill="none" 
							stroke="currentColor" 
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path 
								stroke-linecap="round" 
								stroke-linejoin="round" 
								stroke-width="2" 
								d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
							/>
						</svg>
					</div>
					
					<!-- Button Text -->
					<h2 class="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mb-1">
						Orders Analytics
					</h2>
					
					<!-- Subtitle -->
					<p class="text-xs text-gray-600 mt-1">
						Click to view dashboard
					</p>
					
					<!-- Arrow Icon -->
					<div class="mt-2 flex justify-center">
						<svg 
							class="w-4 h-4 text-blue-600 transition-transform duration-300 group-hover:translate-x-1" 
							fill="none" 
							stroke="currentColor" 
							viewBox="0 0 24 24"
						>
							<path 
								stroke-linecap="round" 
								stroke-linejoin="round" 
								stroke-width="2" 
								d="M13 7l5 5m0 0l-5 5m5-5H6"
							/>
						</svg>
					</div>
				</div>
				
				<!-- Glow Effect on Hover -->
				<div class="absolute inset-0 bg-blue-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
			</button>
		</div>
	</div>
</div>
