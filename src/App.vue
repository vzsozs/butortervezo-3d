<template>
  <div class="relative w-screen h-screen">
    <RouterView />
    <div class="absolute top-4 left-4 bg-white p-4 rounded-lg shadow-lg">
      <h1 class="text-xl font-bold">Paraméterpanel</h1>
      <p class="text-gray-600">A kiválasztott objektum adatai.</p>
    </div>
  </div>
</template>