<script setup lang="ts">
import { ref } from "vue";
import HelloWorld from "./components/HelloWorld.vue";
import { serverScripts } from "./lib/gas";

const name = ref<string>("");
const message = ref<string | null>(null);

const sayHello = async (name: string) => {
  message.value = null;
  const result = await serverScripts.sayHello(name);
  message.value = result;
};
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
    <div>
      <input v-model="name" placeholder="input your name..." />
      <p v-if="message">{{ message }}</p>
      <button v-else v-on:click="() => sayHello(name)" :style="{ marginLeft: '10px'}">Say hello</button>
			</div>
  </div>
  <HelloWorld msg="Vite + Vue" />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
