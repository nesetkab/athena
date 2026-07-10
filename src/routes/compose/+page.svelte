<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<form method="POST" use:enhance class="mx-auto flex max-w-2xl flex-col gap-3 p-4">
	<input name="to" type="email" required placeholder="to" class="rounded border p-2" />
	<input name="subject" required placeholder="subject" class="rounded border p-2" />
	<textarea name="body" rows="12" required placeholder="write sum" class="rounded border p-2"
	></textarea>
	<button class=" rounded bg-green-600 px-4 py-2 text-white">send</button>
</form>

{#if form?.sent}
	sent
{/if}
