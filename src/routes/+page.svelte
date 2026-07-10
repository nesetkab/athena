<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	$effect(() => {
		const es = new EventSource('/events');
		es.onmessage = () => invalidateAll();
		return () => es.close();
	});
</script>

{#each data.inbox as m}
	<a href="/message/{m.id}" class:unread={!m.seen}>
		{m.fromName ?? m.fromAddr}
		{m.subject}
		<div>{m.snippet}</div>
	</a>
{/each}
