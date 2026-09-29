/**
 * Dropdown choices built from the connected device.
 *
 * Actions and feedbacks used plain numbers for channels and mixes, which meant
 * picking "Input 7" in the Companion UI with no way to tell what input 7 is.
 * The server does tell us: mixes carry a name, hardware inputs carry a name,
 * outputs carry a name, and a mixer input's name can be resolved through the
 * source it is assigned to.
 *
 * Choice ids stay one-based numbers, matching the numbers the old number fields
 * stored, so buttons configured before this change keep working. Companion
 * compares a stored value against choice ids loosely, so a value saved as the
 * string "5" still resolves to the numeric choice 5.
 *
 * Before a device arrives there is nothing to name, so each builder falls back
 * to a generic numbered list of the same length the old number fields allowed.
 */

import { isStereoLinked, outputMuteChoices } from './output-controls.js'

/** Sizes of the fallback lists, matching the old number field maxima. */
const FALLBACK_MIXER_INPUTS = 30
const FALLBACK_HARDWARE_INPUTS = 8
const FALLBACK_OUTPUTS = 10
const FALLBACK_MIXES = 10
const FALLBACK_OUTPUT_PAIRS = 5

/**
 * Resolve the name of a mixer input slot.
 *
 * A slot does not carry a name of its own. It carries a source selector whose
 * value is the id of the source feeding it, and that source is named. The
 * assignment can be changed in Focusrite Control at any time, so this is read
 * live from current item values rather than from the arrival snapshot.
 *
 * @returns {string|null} The source name, or null when the slot is unassigned.
 */
function mixerInputName(self, index) {
	const selector = self?.inputSourceControls?.[index]
	if (!selector) return null

	const sourceId = self.items?.get(selector.id)?.value ?? selector.value
	if (sourceId === null || sourceId === undefined || sourceId === '') return null

	return self.client?.sourceNames?.get(String(sourceId)) || null
}

/**
 * Mixer input channels, named by whatever source is assigned to each slot.
 *
 * Unassigned slots are listed rather than hidden, so a button pointing at one
 * keeps its setting and starts working once a source is assigned to it.
 */
export function mixerInputChoices(self) {
	const mix = self?.mixes?.[0]
	const count = mix?.inputs?.length || 0
	if (count === 0) return numberedChoices(FALLBACK_MIXER_INPUTS, 'Input')

	const choices = []
	for (let i = 0; i < count; i++) {
		const name = mixerInputName(self, i)
		choices.push({ id: i + 1, label: name ? `${i + 1}: ${name}` : `${i + 1}: (unassigned)` })
	}
	return choices
}

/**
 * Outputs currently fed by a given mix, named as the device names them.
 *
 * An output's source item holds the id of whatever feeds it, and for a mix
 * output that is the mix's own id. A linked pair is named as the pair, so a mix
 * driving it reads "Monitor Outputs 1-2" rather than "Monitor Output 1".
 *
 * An unlinked output is named on its own. Every left channel carries its pair's
 * name whether or not the pair is linked, so that name is only used while the
 * link item says the pair really is one. Otherwise a mix feeding just Line
 * Output 3 would claim "Line Outputs 3-4", and a second mix feeding Line Output 4
 * would appear to share it.
 *
 * @returns {string[]} Output names, in the order the device lists them.
 */
function mixOutputNames(self, mixId) {
	const names = []
	for (const output of self?.outputs || []) {
		if (!output.source) continue
		const fedBy = self.items?.get(output.source)?.value
		if (fedBy === undefined || fedBy === null) continue
		if (String(fedBy) !== String(mixId)) continue

		const linked = output.stereoName && isStereoLinked(self.outputs, self.items, output)
		const name = linked ? output.stereoName : output.name
		if (name && !names.includes(name)) names.push(name)
	}
	return names
}

/**
 * Mixes, named by where they go rather than only by their own name.
 *
 * "Mix A" on its own says nothing about what it feeds, which is usually the
 * thing you actually want to pick. Where the routing is known the destination is
 * appended, giving "Mix A (Monitor Outputs 1-2)". A mix that currently feeds
 * nothing keeps its plain name, and routing changes relabel it.
 */
export function mixChoices(self) {
	const mixes = self?.mixes || []
	if (mixes.length === 0) return numberedChoices(FALLBACK_MIXES, 'Mix')

	return mixes.map((mix, i) => {
		const base = mix.name || `Mix ${i + 1}`
		const outputs = mixOutputNames(self, mix.id)

		let label = base
		if (outputs.length === 1) {
			label = `${base} (${outputs[0]})`
		} else if (outputs.length > 1) {
			// Several outputs can take the same mix. Name the first couple and
			// count the rest, so the label stays readable.
			const shown = outputs.slice(0, 2).join(', ')
			const rest = outputs.length - 2
			label = rest > 0 ? `${base} (${shown} +${rest} more)` : `${base} (${shown})`
		}

		return { id: i + 1, label }
	})
}

/** Hardware (preamp) inputs, named as the device names them, e.g. "Analogue 1". */
export function hardwareInputChoices(self) {
	const inputs = self?.hardwareInputs || []
	if (inputs.length === 0) return numberedChoices(FALLBACK_HARDWARE_INPUTS, 'Input')

	return inputs.map((input, i) => ({ id: i + 1, label: input.name || `Input ${i + 1}` }))
}

/**
 * Hardware inputs that expose the named control, and only those.
 *
 * Air, pad and input mode are each present on some inputs and not others, so an
 * action for one of them should not offer channels that cannot do it.
 */
export function hardwareInputChoicesWith(self, control) {
	const inputs = self?.hardwareInputs || []
	const matching = inputs.map((input, i) => ({ input, channel: i + 1 })).filter(({ input }) => input?.[control])

	if (matching.length === 0) {
		// Either no device yet, or this device has none. Offering the full input
		// list is the safer of the two, since an empty dropdown cannot hold a
		// value a button had already saved.
		return hardwareInputChoices(self)
	}

	return matching.map(({ input, channel }) => ({ id: channel, label: input.name || `Input ${channel}` }))
}

/** Line outputs, named as the device names them, e.g. "Monitor Output 1". */
export function outputChoices(self) {
	const outputs = self?.outputs || []
	if (outputs.length === 0) return numberedChoices(FALLBACK_OUTPUTS, 'Output')

	return outputs.map((output, i) => ({ id: i + 1, label: output.name || `Output ${i + 1}` }))
}

/**
 * Outputs for the output mute action and feedback.
 *
 * The list itself comes from output-controls.js, which knows whether each pair
 * is currently linked and lists a linked pair as one entry and an unlinked pair
 * as its two channels. This only supplies a fallback for when no device is
 * connected, using the zero-based string ids these fields have always stored.
 */
export function outputPairChoices(self) {
	const choices = outputMuteChoices(self?.outputs, self?.items)
	if (choices.length > 0) return choices

	return Array.from({ length: FALLBACK_OUTPUT_PAIRS }, (_, i) => ({
		id: String(i),
		label: `Output Pair ${i + 1}`,
	}))
}

/**
 * Odd-numbered hardware inputs, labelled as the pair they would link.
 *
 * Stereo link joins an input to its neighbour, so only odd channels are valid
 * and the label names both halves.
 */
export function stereoLinkChoices(self) {
	const inputs = self?.hardwareInputs || []
	if (inputs.length === 0) {
		return [1, 3, 5, 7].map((ch) => ({ id: ch, label: `Input ${ch} + ${ch + 1}` }))
	}

	const choices = []
	for (let i = 0; i + 1 < inputs.length; i += 2) {
		const left = inputs[i]?.name || `Input ${i + 1}`
		const right = inputs[i + 1]?.name || `Input ${i + 2}`
		choices.push({ id: i + 1, label: `${left} + ${right}` })
	}
	return choices
}

/** A generic numbered list, used until a device tells us the real names. */
function numberedChoices(count, noun) {
	const choices = []
	for (let i = 1; i <= count; i++) {
		choices.push({ id: i, label: `${noun} ${i}` })
	}
	return choices
}

/**
 * A dropdown option field backed by one of the lists above.
 *
 * @param {string} id Option id, 'channel' or 'mix'.
 * @param {string} label Field label shown in the UI.
 * @param {{id: number, label: string}[]} choices
 * @param {object} [extra] Additional field properties, e.g. tooltip.
 */
export function dropdownOption(id, label, choices, extra = {}) {
	return {
		id,
		type: 'dropdown',
		label,
		choices,
		default: choices[0]?.id ?? 1,
		// Deliberately no allowCustom. Companion treats a field that accepts
		// custom values as a raw editor: focusing it replaces the label with the
		// underlying id, so the user sees "5" rather than "5: Analogue 2", which
		// defeats the point of naming these at all. There is no way for a module
		// to keep custom values without that behaviour. A value outside the list
		// is a button that cannot work on the connected device, and showing it as
		// invalid is more useful than quietly accepting it.
		minChoicesForSearch: 12,
		...extra,
	}
}
