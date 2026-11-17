/*
	Plans travel inside links: https://…/trip-planner/#plan=<data>,
	where <data> is the plan JSON (UTF-8), compressed with raw DEFLATE and encoded as base64url.
	The plan sits in the URL fragment, so it never reaches the web server and no URL length limit of the host applies.
	skills/trip-map/scripts/build_link.py produces the same encoding.
*/

import { PlanFormatError } from "./plan-format.js";

const PLAN_FRAGMENT_PATTERN = /[#&]plan=([A-Za-z0-9_-]+)/;
const COMPRESSION_FORMAT = "deflate-raw";
// A plan is tens of kilobytes. The limit stops a crafted link from unpacking into gigabytes;
// build_link.py refuses to build a link for a larger plan.
const MAXIMUM_PLAN_JSON_BYTES = 1_000_000;
// Pasted text and chosen files may hold a pretty-printed plan or a link with text around it, so they get twice the room.
export const MAXIMUM_IMPORT_TEXT_LENGTH = 2 * MAXIMUM_PLAN_JSON_BYTES;

export function hasPlanInFragment(fragment) {
	return PLAN_FRAGMENT_PATTERN.test(fragment);
}

/** @returns the raw plan object from a "#plan=…" fragment */
export async function decodePlanFragment(fragment) {
	const encodedPlan = fragment.match(PLAN_FRAGMENT_PATTERN)?.[1];
	if (!encodedPlan) {
		throw new PlanFormatError("planLink.noPlanInLink");
	}
	let planJson;
	try {
		planJson = await decompressToText(base64UrlToBytes(encodedPlan));
	} catch (error) {
		if (error instanceof PlanFormatError) {
			throw error;
		}
		throw new PlanFormatError("planLink.damagedLink");
	}
	return parsePlanJson(planJson);
}

/** @returns a link that opens the plan in this app, e.g. for sharing with fellow travellers */
export async function encodePlanLink(rawPlan) {
	const appUrl = new URL("./", window.location.href);
	const compressedPlan = await compressText(JSON.stringify(rawPlan));
	return `${appUrl.href}#plan=${bytesToBase64Url(compressedPlan)}`;
}

/**
 * Finds a plan in pasted text: a plan link (possibly surrounded by other text or Markdown),
 * plain JSON, or JSON inside a ``` code block.
 */
export async function extractRawPlanFromText(text) {
	if (text.length > MAXIMUM_IMPORT_TEXT_LENGTH) {
		throw new PlanFormatError("planLink.textTooLong");
	}
	const trimmedText = text.trim();
	if (!trimmedText) {
		throw new PlanFormatError("planLink.emptyText");
	}
	if (hasPlanInFragment(trimmedText)) {
		return decodePlanFragment(trimmedText);
	}
	const codeBlockContent = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
	const jsonCandidate = codeBlockContent ?? trimmedText.slice(trimmedText.indexOf("{"), trimmedText.lastIndexOf("}") + 1);
	if (!jsonCandidate) {
		throw new PlanFormatError("planLink.noPlanInText");
	}
	return parsePlanJson(jsonCandidate);
}

function parsePlanJson(planJson) {
	try {
		return JSON.parse(planJson);
	} catch (error) {
		throw new PlanFormatError("planLink.unreadableJson", { reason: error.message });
	}
}

async function compressText(text) {
	const compressedStream = new Blob([text]).stream().pipeThrough(new CompressionStream(COMPRESSION_FORMAT));
	return new Uint8Array(await new Response(compressedStream).arrayBuffer());
}

async function decompressToText(bytes) {
	const decompressedStream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(COMPRESSION_FORMAT));
	const reader = decompressedStream.getReader();
	const chunks = [];
	let byteCount = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		byteCount += value.length;
		if (byteCount > MAXIMUM_PLAN_JSON_BYTES) {
			await reader.cancel();
			throw new PlanFormatError("planLink.planTooLarge");
		}
		chunks.push(value);
	}
	return new Blob(chunks).text();
}

function base64UrlToBytes(base64Url) {
	const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
	const paddedBase64 = base64 + "=".repeat((4 - base64.length % 4) % 4);
	return Uint8Array.from(atob(paddedBase64), character => character.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
	// String.fromCharCode(...bytes) would overflow the call stack for large plans, so the bytes go in chunks.
	const CHUNK_SIZE = 0x8000;
	let binaryText = "";
	for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
		binaryText += String.fromCharCode(...bytes.subarray(start, start + CHUNK_SIZE));
	}
	return btoa(binaryText).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
