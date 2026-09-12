import React from 'react';
import '../../styles/theme.css';

const AppHeader = ({ title, onExportCsv }) => (
  <header>
    <h1>{title}</h1>
    <button onClick={onExportCsv}>Export CSV</button>
  </header>
);

export default AppHeader;
