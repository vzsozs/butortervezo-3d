<script setup lang="ts">
import { type SlotGroup } from '@/config/furniture'
import LayoutControlItem from './LayoutControlItem.vue'
import { computed } from 'vue'
import { useInspectorData } from '@/composables/inspector/useInspectorLogic'
import { useConfigStore } from '@/stores/config'

const props = defineProps<{
  slotGroups: SlotGroup[]
  areDoorsVisible: boolean
}>()

defineEmits<{
  (e: 'toggleDoors'): void
  (e: 'forceHideDoors'): void
}>()

// --- ÚJ LOGIKA: Polc detektálás a szülő szinten ---
const { selectedObject, currentConfig } = useInspectorData()
const configStore = useConfigStore()

const hasShelves = computed(() => {
  if (!currentConfig.value || !selectedObject.value) return false;

  const state = selectedObject.value.userData.componentState || {};

  // Végignézzük a slotokat, van-e olyan komponens, aminek van maxShelves értéke
  for (const slot of currentConfig.value.componentSlots) {
    const componentId = state[slot.slotId] || slot.defaultComponent;
    if (!componentId) continue;

    const comp = configStore.getComponentById(componentId);
    if (comp?.properties?.maxShelves && comp.properties.maxShelves > 0) {
      return true;
    }
  }
  return false;
});

// --- VIRTUÁLIS CSOPORT KÉPZÉS ---
// Ha nincs layout csoport, de van polc, akkor csinálunk egy "kamu" csoportot,
// hogy a LayoutControlItem létrejöjjön és kirajzolja a csúszkát.
const effectiveGroups = computed<SlotGroup[]>(() => {
  // 1. Ha vannak valódi csoportok (Layoutos bútor), használjuk azokat
  if (props.slotGroups && props.slotGroups.length > 0) {
    return props.slotGroups;
  }

  // 2. Ha nincsenek csoportok, de van polc lehetőség -> Virtuális csoport
  if (hasShelves.value) {
    return [{
      groupId: 'virtual_shelf_settings',
      name: 'Beállítások', // Ez a név átmegy a szűrőn (LayoutControlItem)
      controlType: 'schema_select', // Nem számít, mert nincs séma
      schemas: [], // Üres, tehát a legördülő nem jelenik meg
      controlledSlots: []
    }];
  }

  // 3. Egyébként üres
  return [];
});
</script>

<template>
  <!-- Itt most már az effectiveGroups-ot vizsgáljuk -->
  <div v-if="effectiveGroups.length > 0">
    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Elrendezés</h3>
    <div class="space-y-4">
      <div v-for="(group, index) in effectiveGroups" :key="group.groupId">
        <LayoutControlItem :group="group" :index="index" :are-doors-visible="areDoorsVisible"
          @toggle-doors="$emit('toggleDoors')" @force-hide-doors="$emit('forceHideDoors')" />
      </div>
    </div>
  </div>
</template>
