(() => {
  const { register, command, toast, copyText, downloadFile } = globalThis.Browsekit;

  const onlyAlt = event => event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;
  const cellText = (row, index) => row.cells[index]?.textContent.trim() ?? '';

  function asNumber(text) {
    const cleaned = text.replace(/[,\s%$€£¥]/g, '');
    return cleaned !== '' && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : null;
  }

  register({
    id: 'table-sort',
    name: 'Sort any table',
    category: 'tables',
    shortcut: 'Alt+Click header',
    description: 'Alt+click a table header to sort by that column; click again to reverse. Numbers sort numerically.',
    run() {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      document.addEventListener('click', event => {
        if (!onlyAlt(event)) return;
        const header = event.target.closest?.('th');
        const body = header?.closest('table')?.tBodies[0];
        if (!body) return;
        event.preventDefault();
        event.stopPropagation();

        const index = header.cellIndex;
        const rows = [...body.rows].filter(row => row !== header.parentElement);
        const descending = header.dataset.browsekitSort === 'asc';
        header.dataset.browsekitSort = descending ? 'desc' : 'asc';
        const numeric = rows.every(row => {
          const text = cellText(row, index);
          return text === '' || asNumber(text) !== null;
        });

        rows.sort((a, b) => {
          const x = cellText(a, index);
          const y = cellText(b, index);
          let result;
          if (numeric) {
            const nx = asNumber(x) ?? -Infinity;
            const ny = asNumber(y) ?? -Infinity;
            result = nx === ny ? 0 : nx < ny ? -1 : 1;
          } else {
            result = collator.compare(x, y);
          }
          return descending ? -result : result;
        });
        body.append(...rows);
        toast(`Sorted by “${header.textContent.trim()}” ${descending ? '↓' : '↑'}`);
      }, true);
    },
  });

  register({
    id: 'table-copy',
    name: 'Copy table for spreadsheets',
    category: 'tables',
    shortcut: 'Alt+Click cell',
    description: 'Alt+click any table cell to copy the whole table as tab-separated text, ready to paste into Excel or Sheets.',
    run() {
      document.addEventListener('click', event => {
        if (!onlyAlt(event)) return;
        const table = event.target.closest?.('td')?.closest('table');
        if (!table) return;
        event.preventDefault();
        event.stopPropagation();
        const tsv = [...table.rows]
          .map(row => [...row.cells].map(cell => cell.innerText.replace(/\s+/g, ' ').trim()).join('\t'))
          .join('\n');
        copyText(tsv).then(copied =>
          toast(copied ? `Copied table (${table.rows.length} rows) — paste into a spreadsheet` : 'Copy failed'));
      }, true);
    },
  });

  const isHeaderRow = row => [...row.cells].every(cell => cell.tagName === 'TH');

  register({
    id: 'table-filter',
    name: 'Filter table rows',
    category: 'tables',
    description: 'Adds a search box above each table that hides rows not matching what you type. Run it from the command palette.',
    run() {
      command('Add filter boxes to tables', null, () => {
        const tables = [...document.querySelectorAll('table')]
          .filter(table => [...table.tBodies].reduce((sum, body) => sum + body.rows.length, 0) > 3)
          .filter(table => !table.previousElementSibling?.classList.contains('browsekit-table-filter'));
        if (!tables.length) return false;
        for (const table of tables) {
          const rows = [...table.tBodies].flatMap(body => [...body.rows]).filter(row => !isHeaderRow(row));
          const input = document.createElement('input');
          input.type = 'search';
          input.className = 'browsekit-table-filter';
          input.placeholder = `Filter ${rows.length} rows…`;
          input.style.cssText = 'display:block;margin:6px 0;padding:4px 8px;width:min(320px,100%);font:13px system-ui,sans-serif;border:1px solid #bbb;border-radius:6px';
          input.addEventListener('input', () => {
            const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
            let shown = 0;
            for (const row of rows) {
              const text = row.textContent.toLowerCase();
              const match = words.every(word => text.includes(word));
              row.style.display = match ? '' : 'none';
              shown += match;
            }
            input.title = `${shown} of ${rows.length} rows shown`;
          });
          table.before(input);
        }
        toast(`Added filter boxes to ${tables.length} table(s)`);
      });
    },
  });

  // Quotes a CSV cell when needed, and defuses spreadsheet formulas (cells starting with = or @).
  function csvCell(text) {
    const safe = /^[=@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  register({
    id: 'table-csv-download',
    name: 'Download tables as CSV',
    category: 'tables',
    description: 'Saves the tables on the page as CSV files that open in Excel, Numbers or Google Sheets. Run it from the command palette.',
    run() {
      command('Download tables as CSV', null, () => {
        const tables = [...document.querySelectorAll('table')].filter(table => table.rows.length > 1).slice(0, 10);
        if (!tables.length) return false;
        const baseName = (document.title || 'table').slice(0, 60);
        tables.forEach((table, index) => {
          const csv = [...table.rows]
            .map(row => [...row.cells].map(cell => csvCell(cell.innerText.replace(/\s+/g, ' ').trim())).join(','))
            .join('\r\n');
          // The byte-order mark makes Excel read the file as UTF-8.
          downloadFile(`﻿${csv}`, `${baseName}${tables.length > 1 ? `-${index + 1}` : ''}.csv`, 'text/csv');
        });
        toast(`Downloading ${tables.length} table(s)`);
      });
    },
  });
})();
