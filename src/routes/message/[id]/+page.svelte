<script lang="ts">
	import Viewer from '$lib/comp/viewer.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	$effect(() => {
		if (!data.msg.seen) {
			fetch(`/message/${data.msg.id}/read`, { method: 'POST' });
		}
	});
</script>

<div class="min-w-screen min-h-screen overflow-scroll flex flex-col">
	<a href="/">go back</a>
	<h1>{data.msg.subject}</h1>
	<p>{data.msg.fromName ?? data.msg.fromAddr}</p>
	<Viewer htmlBody={data.msg.htmlBody} textBody={data.msg.textBody} />
</div>
