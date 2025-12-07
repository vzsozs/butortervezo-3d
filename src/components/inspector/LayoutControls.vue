<script setup lang="ts">
import { type SlotGroup } from '@/config/furniture'
import LayoutControlItem from './LayoutControlItem.vue'

defineProps<{
    slotGroups: SlotGroup[]
    areDoorsVisible: boolean
}>()

defineEmits<{
    (e: 'toggleDoors'): void
    (e: 'forceHideDoors'): void
}>()
</script>

<template>
    <div v-if="slotGroups.length > 0">
        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Elrendezés</h3>
        <div class="space-y-4">
            <div v-for="(group, index) in slotGroups" :key="group.groupId">
                <LayoutControlItem :group="group" :index="index" :are-doors-visible="areDoorsVisible"
                    @toggle-doors="$emit('toggleDoors')" @force-hide-doors="$emit('forceHideDoors')" />
            </div>
        </div>
    </div>
</template>
