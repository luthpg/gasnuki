import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { gas } from 'vite-plugin-google-apps-script'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), gas(), viteSingleFile()],
	build: {
		outDir: "dist",
	},
});
