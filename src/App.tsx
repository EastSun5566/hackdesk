// import { useState } from "react";
// import { invoke } from "@tauri-apps/api/tauri";

import Routes from './routes';
import "./App.css";

function App() {
  // async function greet() {
  //   // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  //   setGreetMsg(await invoke("greet", { name }));
  // }

  return (
    <Routes />
  );
}

export default App;
