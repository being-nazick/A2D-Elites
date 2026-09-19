// import { createContext, useContext, useEffect, useState } from "react";
// import { LIGHT, DARK } from "./constants";

// const ThemeContext = createContext(null);

// export function ThemeProvider({ children }) {
//   const [darkMode, setDarkMode] = useState(() => {
//     return localStorage.getItem("dairy-dark-mode") === "true";
//   });

//   const C = darkMode ? DARK : LIGHT;

//   useEffect(() => {
//     localStorage.setItem("dairy-dark-mode", darkMode);

//     document.body.style.background = C.bg;
//     document.body.style.color = C.ink;

//     document.documentElement.style.background = C.bg;
//   }, [darkMode, C]);

//   const toggleDarkMode = () => {
//     setDarkMode((current) => !current);
//   };

//   return (
//     <ThemeContext.Provider
//       value={{
//         C,
//         darkMode,
//         setDarkMode,
//         toggleDarkMode,
//       }}
//     >
//       {children}
//     </ThemeContext.Provider>
//   );
// }

// export function useTheme() {
//   const context = useContext(ThemeContext);

//   if (!context) {
//     throw new Error(
//       "useTheme must be used inside ThemeProvider",
//     );
//   }

//   return context;
// }
