/** @type {import('tailwindcss').Config} */
module.exports = { darkMode: ['class'], content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink:'#07110f', panel:'#0d1b17', line:'#1c3930', mint:'#8ff0c1', emerald:'#24c982' }, boxShadow: { glow:'0 0 35px rgba(36,201,130,.12)' } } }, plugins: [] };
