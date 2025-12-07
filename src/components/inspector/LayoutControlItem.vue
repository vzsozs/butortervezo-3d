<script setup lang="ts">
import { type SlotGroup } from '@/config/furniture'
import {
    useLayoutLogic,
    useShelfLogic,
    useInspectorData
} from '@/composables/inspector/useInspectorLogic'
import { computed } from 'vue'

const props = defineProps<{
    group: SlotGroup
    index: number
    areDoorsVisible: boolean
}>()

const emit = defineEmits<{
    (e: 'toggleDoors'): void
    (e: 'forceHideDoors'): void
}>()

const { selectedObject, currentConfig, currentState } = useInspectorData()
const { getLayoutDropdownValue, handleGroupChange, hasLayoutSchema } = useLayoutLogic(selectedObject)

// Proxy for door visibility to pass to useShelfLogic
// When useShelfLogic tries to write to it, we emit current intent
const areDoorsVisibleRef = computed({
    get: () => props.areDoorsVisible,
    set: (val) => {
        if (val === false && props.areDoorsVisible === true) {
            emit('forceHideDoors')
        }
        // We don't handle 'true' setting here implicitly
    }
})

const applyDoorVisibilityProxy = () => {
    // forceHideDoors event is enough to trigger the parent to hide and apply
}

const { hasShelfSchema, getMaxShelves, getShelfCount, setShelfCount } = useShelfLogic(
    currentConfig,
    currentState,
    areDoorsVisibleRef as any, // Cast because we are doing a trick
    applyDoorVisibilityProxy
)

// Wrapper for setShelfCount because of the weird ref proxying
function updateShelfCount(val: number) {
    setShelfCount(props.index, props.group, val)
}

</script>

<template>
    <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">{{ group.name }}</label>

        <!-- Layout Dropdown -->
        <div v-if="hasLayoutSchema(group)" class="relative group mb-2">
            <select
                class="w-full bg-[#2a2a2a] border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-2 pr-8 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer hover:bg-[#333]"
                @change="handleGroupChange(index, ($event.target as HTMLSelectElement).value)"
                :value="getLayoutDropdownValue(group)">
                <template v-for="schema in group.schemas" :key="schema.id">
                    <option v-if="(schema as any).type !== 'shelf'" :value="schema.id">{{ schema.name }}</option>
                </template>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="fill-current h-3 w-3" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
            </div>
        </div>

        <!-- Polc Input -->
        <div v-if="hasShelfSchema(group)"
            class="flex items-center gap-2 bg-[#252525] p-2 rounded-md border border-gray-800 mt-2">
            <span class="text-[11px] text-gray-400 uppercase font-bold">Polcok:</span>
            <div class="relative flex-1">
                <input type="number" min="0" :max="getMaxShelves(group)" :value="getShelfCount(group)"
                    @input="updateShelfCount(parseInt(($event.target as HTMLInputElement).value))"
                    class="w-full bg-[#333] border border-gray-600 text-white text-sm font-bold rounded py-1 pl-2 pr-8 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none" />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">db</span>
            </div>
            <button @click="$emit('toggleDoors')" title="Ajtók megjelenítése/elrejtése"
                class="flex items-center justify-center w-7 h-7 rounded transition-all border border-transparent"
                :class="areDoorsVisible ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path v-if="areDoorsVisible" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
            </button>
            <span class="text-[10px] text-gray-500 w-10 text-right">Max: {{ getMaxShelves(group) }}</span>
        </div>
    </div>
</template>
