<script setup lang="ts">
import { type DisplayGroup } from '@/composables/inspector/useInspectorGrouping'
import { ComponentType } from '@/config/furniture'
import { useInspectorGrouping } from '@/composables/inspector/useInspectorGrouping'
import {
  useMaterialSelection,
  usePromotedProperties,
  useInspectorData
} from '@/composables/inspector/useInspectorLogic'

defineProps<{
  group: DisplayGroup
}>()

const { selectedObject, currentConfig, currentState } = useInspectorData()

const {
  getCurrentControlValue,
  getOptionsForControl,
  handleUnifiedChange
} = useInspectorGrouping(currentConfig, currentState)

const {
  openMaterialSelector,
  shouldShowMaterialSelector,
  isMaterialInherited,
  getMatType,
  getMatValue,
  getMatThumbnail
} = useMaterialSelection(currentState, selectedObject)

const {
  legConstraints,
  isControlStandardLeg,
  localPlinthHeight,
  hasOverride,
  resetPlinthOverride,
  ensureOverride
} = usePromotedProperties(selectedObject)

</script>

<template>
  <div class="mb-6">

    <!-- CÍMSOR + ÖSSZESÍTŐ CÍMKE -->
    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
      {{ group.label }}
      <span v-if="group.controls.length === 1 && group.controls[0]?.isGrouped"
        class="text-[10px] text-blue-400 normal-case bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-800/50">
        Összes
      </span>
    </h3>

    <div class="space-y-3">
      <div v-for="control in group.controls" :key="control.id">

        <!-- ALCÍM -->
        <label v-if="group.controls.length > 1" class="block text-xs font-medium text-gray-400 mb-1">
          {{ control.label }}
          <span v-if="control.isGrouped" class="text-blue-400 ml-1 text-[10px]">(Összes)</span>
        </label>

        <!-- GRID LAYOUT -->
        <div class="grid grid-cols-3 gap-2 min-h-[32px]">

          <!-- 1. Dropdown (Stílus választó) -->
          <div class="col-span-2 relative h-8">
            <template v-if="group.id !== ComponentType.CORPUS">
              <select :value="getCurrentControlValue(control)"
                @change="e => handleUnifiedChange(control, (e.target as HTMLSelectElement).value)"
                class="w-full h-full bg-[#2a2a2a] text-gray-200 text-xs rounded-md pl-2 pr-6 appearance-none border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors cursor-pointer hover:bg-[#333]">
                <option v-for="opt in getOptionsForControl(control)" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </template>
            <template v-else>
              <div
                class="w-full h-full flex items-center px-2 text-gray-500 text-xs italic bg-[#2a2a2a] rounded-md border border-gray-700 opacity-50 cursor-not-allowed select-none">
                Fix elem
              </div>
            </template>
          </div>

          <!-- 2. Material Button(s) -->

          <!-- A) MULTI-MATERIAL MÓD (Több gomb) -->
          <div v-if="control.materialSlots && control.materialSlots.length > 0" class="col-span-1 flex flex-col gap-2">
            <div v-for="slot in control.materialSlots" :key="slot.key" class="flex flex-col">

              <button @click="openMaterialSelector(control, slot.key)"
                class="h-8 w-full rounded-md border border-gray-700 relative overflow-hidden transition-all hover:border-gray-500 cursor-pointer bg-[#2a2a2a]"
                :title="slot.label + ' anyagának módosítása'">

                <div class="w-full h-full flex items-center justify-center bg-gray-800">
                  <!-- ITT A LÉNYEG: Átadjuk a slot.key-t a gettereknek -->
                  <div v-if="getMatType(control.referenceSlot.slotId, slot.key) === 'color'" class="w-full h-full"
                    :style="{ backgroundColor: getMatValue(control.referenceSlot.slotId, slot.key) }">
                  </div>
                  <img v-else :src="getMatThumbnail(control.referenceSlot.slotId, slot.key)"
                    class="w-full h-full object-cover" />
                </div>
              </button>
              <!-- Slot neve -->
              <span class="text-[9px] text-gray-500 leading-tight mb-0.5 truncate">{{ slot.label }}</span>
            </div>
          </div>

          <!-- B) SIMPLE MÓD (Egy gomb) -->
          <button v-else-if="shouldShowMaterialSelector(control.referenceSlot)"
            @click="!isMaterialInherited(control.referenceSlot) && openMaterialSelector(control)"
            class="col-span-1 h-8 rounded-md border border-gray-700 relative overflow-hidden transition-all group"
            :class="isMaterialInherited(control.referenceSlot)
              ? 'opacity-50 cursor-not-allowed bg-gray-800'
              : 'hover:border-gray-500 cursor-pointer bg-[#2a2a2a]'"
            :title="isMaterialInherited(control.referenceSlot) ? 'Ez az elem a korpusz színét örökli' : 'Anyag módosítása'">

            <div class="w-full h-full flex items-center justify-center bg-gray-800">
              <!-- Itt nem adunk át második paramétert, így null lesz (base) -->
              <div v-if="getMatType(control.referenceSlot.slotId) === 'color'" class="w-full h-full"
                :style="{ backgroundColor: getMatValue(control.referenceSlot.slotId) }">
              </div>
              <img v-else :src="getMatThumbnail(control.referenceSlot.slotId)" class="w-full h-full object-cover" />
            </div>

            <div v-if="isMaterialInherited(control.referenceSlot)" class="absolute inset-0 z-10 pointer-events-none">
              <svg class="w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="100%" x2="100%" y2="0" stroke="#ef4444" stroke-width="1.5" stroke-opacity="0.8" />
              </svg>
            </div>
          </button>

          <div v-else class="col-span-1"></div>

        </div>

        <!-- EGYEDI LÁBAZAT MAGASSÁG CSÚSZKA -->
        <div v-if="group.id === 'legs' && isControlStandardLeg(control, currentState)"
          class="mt-2 p-2 bg-gray-800/50 rounded border border-gray-700">
          <div class="flex justify-between items-center mb-1">
            <label class="text-[10px] font-bold text-gray-400">
              {{ hasOverride ? 'Egyedi Magasság' : 'Globális Magasság' }}
            </label>

            <button v-if="hasOverride" @click="resetPlinthOverride"
              class="text-[9px] bg-blue-900 text-blue-200 px-1.5 rounded hover:bg-blue-800 transition-colors"
              title="Visszaállítás globálisra">
              AUTO
            </button>

            <span class="text-[10px] font-mono" :class="hasOverride ? 'text-blue-400' : 'text-gray-500'">
              {{ (localPlinthHeight * 100).toFixed(1) }} cm
            </span>
          </div>

          <input type="range" :min="legConstraints.minHeight" :max="legConstraints.maxHeight" step="0.005"
            v-model.number="localPlinthHeight"
            class="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            :class="{ 'opacity-50': !hasOverride }" @input="ensureOverride" />
        </div>
      </div>
    </div>
  </div>
</template>
