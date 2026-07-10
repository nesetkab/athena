<script lang="ts">
	let { htmlBody = null, textBody = null } = $props();
</script>

<div class="min-w-fit flex-col h-full">
	{#if htmlBody}
		<iframe
			class="w-full h-[75vh] rounded-md bg-black"
			sandbox=""
			srcdoc={htmlBody}
			title="email body"
		></iframe>
	{:else if textBody}
		<pre>{textBody}</pre>
	{:else}
		<p>nothing to see!</p>
	{/if}
</div>
