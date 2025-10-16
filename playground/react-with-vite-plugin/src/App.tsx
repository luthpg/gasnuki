import { useState } from "react";
import viteLogo from "/vite.svg";
import reactLogo from "./assets/react.svg";
import "./App.css";
import { serverScripts } from "./lib/gas";

function App() {
	const [count, setCount] = useState(0);
	const [name, setName] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const sayHello = async (name: string) => {
		setMessage(null);
		const result = await serverScripts.sayHello(name);
		setMessage(result);
	};

	return (
		<>
			<div>
				<a href="https://vite.dev" target="_blank" rel="noreferrer">
					<img src={viteLogo} className="logo" alt="Vite logo" />
				</a>
				<a href="https://react.dev" target="_blank" rel="noreferrer">
					<img src={reactLogo} className="logo react" alt="React logo" />
				</a>
			</div>
			<h1>Vite + React</h1>
			<div className="card">
				<button onClick={() => setCount((count) => count + 1)}>
					count is {count}
				</button>
				<p>
					Edit <code>src/App.tsx</code> and save to test HMR
				</p>
			</div>
			<div>
				<input value={name} placeholder="input your name..." onChange={(e) => setName(e.target.value)} />
				{message ? <p>{message}</p> : <button onClick={() => sayHello(name)} style={{ marginLeft: '10px'}}>Say hello</button>}
			</div>
			<p className="read-the-docs">
				Click on the Vite and React logos to learn more
			</p>
		</>
	);
}

export default App;
