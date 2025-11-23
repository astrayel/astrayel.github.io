
// Global state
let allRecords = [];
let mappedColumns = {};

// Initialize Grist API
grist.ready({
    columns: [
        { name: 'date', title: 'Date (Mois/Année)', type: 'Date' },
        { name: 'service', title: 'Service', type: 'Text' },

        // Signalisations
        { name: 'nb_signalisations_pap', title: 'Nb Sig. Papillaires', type: 'Int' },
        { name: 'nb_signalisations_bio', title: 'Nb Sig. Biologiques', type: 'Int' },
        { name: 'nb_mis_en_cause_pap', title: 'Nb MEC PAP', type: 'Int' },
        { name: 'nb_mis_en_cause_bio', title: 'Nb MEC BIO', type: 'Int' },
        { name: 'obj_papillaires', title: 'Objectif Papillaires', type: 'Numeric', optional: true },
        { name: 'obj_biologiques', title: 'Objectif Biologiques', type: 'Numeric', optional: true },

        // Transports
        { name: 'nb_transports_vpe', title: 'Nb Transports VPE', type: 'Int' },
        { name: 'nb_transports_dvv', title: 'Nb Transports DVV', type: 'Int' },
        { name: 'nb_transports_vr', title: 'Nb Transports VR', type: 'Int' },
        { name: 'nb_transports_dm', title: 'Nb Transports DM', type: 'Int' },
        { name: 'faits_vpe', title: 'Faits VPE', type: 'Int' },
        { name: 'faits_dvv', title: 'Faits DVV', type: 'Int' },
        { name: 'faits_vr', title: 'Faits VR', type: 'Int' },
        { name: 'faits_dm', title: 'Faits DM', type: 'Int' },
        { name: 'obj_transport_vpe', title: 'Objectif VPE', type: 'Numeric', optional: true },
        { name: 'obj_transport_autres', title: 'Objectif Autres Transports', type: 'Numeric', optional: true }
    ],
    requiredAccess: 'read table'
});

grist.onRecords(function (records, mappings) {
    allRecords = grist.mapColumnNames(records);
    mappedColumns = mappings;

    if (allRecords.length > 0) {
        populateDateSelectors();
        document.getElementById('generate-btn').disabled = false;
        updateStatus(`${allRecords.length} enregistrements chargés. Prêt.`);
    } else {
        updateStatus("Aucune donnée trouvée.");
    }
});

function updateStatus(msg, type = 'normal') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = 'status-message ' + (type === 'error' ? 'error' : (type === 'success' ? 'success' : ''));
}

function populateDateSelectors() {
    const dates = new Set();
    allRecords.forEach(r => {
        if (r.date) {
            const d = new Date(r.date); // Grist dates are seconds since epoch
            if (!isNaN(d.getTime())) {
                dates.add(d.toISOString().substring(0, 7)); // YYYY-MM
            }
        }
    });

    const sortedDates = Array.from(dates).sort().reverse();
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');

    // Clear existing
    monthSelect.innerHTML = '';
    yearSelect.innerHTML = '';

    // Populate Years
    const years = new Set(sortedDates.map(d => d.split('-')[0]));
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    });

    // Populate Months (1-12)
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    monthNames.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = String(i + 1).padStart(2, '0');
        opt.textContent = m;
        monthSelect.appendChild(opt);
    });

    // Set default to latest available
    if (sortedDates.length > 0) {
        const [y, m] = sortedDates[0].split('-');
        yearSelect.value = y;
        monthSelect.value = m;
    }
}

document.getElementById('generate-btn').addEventListener('click', async () => {
    const selectedYear = document.getElementById('year-select').value;
    const selectedMonth = document.getElementById('month-select').value;

    if (!selectedYear || !selectedMonth) return;

    updateStatus("Génération en cours...", "normal");

    try {
        await generatePDF(parseInt(selectedYear), parseInt(selectedMonth));
        updateStatus("PDF généré avec succès !", "success");
    } catch (e) {
        console.error(e);
        updateStatus("Erreur lors de la génération : " + e.message, "error");
    }
});

async function generatePDF(year, month) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const currentMonthName = monthNames[month - 1];

    // Filter data for the selected month to find active services
    // Note: We need historical data for charts, so we filter services first
    const targetDateStr = `${year}-${String(month).padStart(2, '0')}`;

    // Group all records by Service
    const services = {};
    allRecords.forEach(r => {
        if (!r.service) return;
        if (!services[r.service]) services[r.service] = [];
        services[r.service].push(r);
    });

    let pageAdded = false;

    for (const [serviceName, records] of Object.entries(services)) {
        // Sort records by date
        records.sort((a, b) => a.date - b.date);

        // Find the record for the selected month
        const currentRecord = records.find(r => {
            const d = new Date(r.date);
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
        });

        if (!currentRecord) continue; // Skip service if no data for selected month

        if (pageAdded) doc.addPage();
        pageAdded = true;

        // --- Header ---
        doc.setFontSize(18);
        doc.text(`Rapport Mensuel - ${serviceName}`, 14, 20);
        doc.setFontSize(12);
        doc.text(`Période : ${String(month).padStart(2, '0')}/${year}`, 14, 28);

        // --- Section 1: Signalisations ---
        doc.setFontSize(14);
        doc.setTextColor(44, 62, 80);
        doc.text("Signalisations", 14, 38);

        // Prepare Data for Table
        const statsSig = calculateStats(records, year, month);

        const tableDataSig = [
            [currentMonthName,
                statsSig.current.nb_signalisations_pap, statsSig.current.nb_mis_en_cause_pap, formatPercent(statsSig.current.taux_papillaires),
                statsSig.current.nb_signalisations_bio, statsSig.current.nb_mis_en_cause_bio, formatPercent(statsSig.current.taux_genetiques)
            ],
            ['Année en cours',
                statsSig.ytd.nb_signalisations_pap, statsSig.ytd.nb_mis_en_cause_pap, formatPercent(statsSig.ytd.taux_papillaires),
                statsSig.ytd.nb_signalisations_bio, statsSig.ytd.nb_mis_en_cause_bio, formatPercent(statsSig.ytd.taux_genetiques)
            ],
            ['12 Mois Glissants',
                statsSig.rolling.nb_signalisations_pap, statsSig.rolling.nb_mis_en_cause_pap, formatPercent(statsSig.rolling.taux_papillaires),
                statsSig.rolling.nb_signalisations_bio, statsSig.rolling.nb_mis_en_cause_bio, formatPercent(statsSig.rolling.taux_genetiques)
            ]
        ];

        doc.autoTable({
            startY: 42,
            head: [['Période', 'Sig Pap', 'MEC Pap', '% Pap', 'Sig Bio', 'MEC Bio', '% Bio']],
            body: tableDataSig,
            theme: 'grid',
            headStyles: { fillColor: [22, 160, 133], fontSize: 9 },
            styles: { fontSize: 9, cellPadding: 1.5 }
        });

        let finalY = doc.lastAutoTable.finalY + 5;

        // Charts Signalisations
        const chartData = getRollingData(records, year, month, 12);

        // Reduced height for charts to 40
        const imgPap = await renderChart('chart-papillaires', 'Evolution du taux de signalisations papillaires', chartData.labels, chartData.values.taux_papillaires, currentRecord.obj_papillaires);
        const imgBio = await renderChart('chart-biologiques', 'Evolution du taux de signalisations biologiques', chartData.labels, chartData.values.taux_genetiques, currentRecord.obj_biologiques);

        doc.addImage(imgPap, 'JPEG', 14, finalY, 85, 40);
        doc.addImage(imgBio, 'JPEG', 105, finalY, 85, 40);

        finalY += 45;

        // --- Section 2: Transports ---
        doc.setFontSize(14);
        doc.text("Transports", 14, finalY);
        finalY += 5;

        // Table Transports
        const tableDataTrans = [
            [currentMonthName,
                statsSig.current.nb_transports_vpe, statsSig.current.faits_vpe, formatPercent(statsSig.current.taux_vpe),
                statsSig.current.nb_transports_dvv, statsSig.current.faits_dvv, formatPercent(statsSig.current.taux_dvv),
                statsSig.current.nb_transports_vr, statsSig.current.faits_vr, formatPercent(statsSig.current.taux_vr),
                statsSig.current.nb_transports_dm, statsSig.current.faits_dm, formatPercent(statsSig.current.taux_dm)
            ],
            ['12 Mois',
                statsSig.rolling.nb_transports_vpe, statsSig.rolling.faits_vpe, formatPercent(statsSig.rolling.taux_vpe),
                statsSig.rolling.nb_transports_dvv, statsSig.rolling.faits_dvv, formatPercent(statsSig.rolling.taux_dvv),
                statsSig.rolling.nb_transports_vr, statsSig.rolling.faits_vr, formatPercent(statsSig.rolling.taux_vr),
                statsSig.rolling.nb_transports_dm, statsSig.rolling.faits_dm, formatPercent(statsSig.rolling.taux_dm)
            ]
        ];

        doc.autoTable({
            startY: finalY,
            head: [['Période', 'Tr VPE', 'Fts', '%', 'Tr DVV', 'Fts', '%', 'Tr VR', 'Fts', '%', 'Tr DM', 'Fts', '%']],
            body: tableDataTrans,
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80], fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1 }
        });

        finalY = doc.lastAutoTable.finalY + 5;

        // Charts Transports (4 charts)
        const imgVPE = await renderChart('chart-transports-vpe', 'Taux VPE', chartData.labels, chartData.values.taux_vpe, currentRecord.obj_transport_vpe);
        const imgDVV = await renderChart('chart-transports-dvv', 'Taux DVV', chartData.labels, chartData.values.taux_dvv, currentRecord.obj_transport_autres);
        const imgVR = await renderChart('chart-transports-vr', 'Taux VR', chartData.labels, chartData.values.taux_vr, currentRecord.obj_transport_autres);
        const imgDM = await renderChart('chart-transports-dm', 'Taux DM', chartData.labels, chartData.values.taux_dm, currentRecord.obj_transport_autres);

        // 2x2 Grid with reduced height (40)
        doc.addImage(imgVPE, 'JPEG', 14, finalY, 85, 40);
        doc.addImage(imgDVV, 'JPEG', 105, finalY, 85, 40);

        finalY += 42;
        doc.addImage(imgVR, 'JPEG', 14, finalY, 85, 40);
        doc.addImage(imgDM, 'JPEG', 105, finalY, 85, 40);
    }

    doc.save(`Rapport_DPS_${currentMonthName}_${year}.pdf`);
}

function calculateStats(records, year, month) {
    const targetDate = new Date(year, month - 1, 1);

    // Filter Functions
    const isCurrent = (r) => { const d = new Date(r.date); return d.getFullYear() === year && d.getMonth() === (month - 1); };
    const isYTD = (r) => { const d = new Date(r.date); return d.getFullYear() === year && d.getMonth() <= (month - 1); };
    const isRolling = (r) => {
        const d = new Date(r.date);
        const rDate = new Date(d.getFullYear(), d.getMonth(), 1);
        const endDate = new Date(year, month - 1, 1);
        const startDate = new Date(year, month - 1, 1);
        startDate.setMonth(startDate.getMonth() - 11);
        return rDate >= startDate && rDate <= endDate;
    };

    const currentRecords = records.filter(isCurrent);
    const ytdRecords = records.filter(isYTD);
    const rollingRecords = records.filter(isRolling);

    const calc = (recs) => {
        const sum = (f) => recs.reduce((acc, r) => acc + Number(r[f] || 0), 0);

        // Sums
        const res = {
            nb_signalisations_pap: sum('nb_signalisations_pap'),
            nb_mis_en_cause_pap: sum('nb_mis_en_cause_pap'),
            nb_signalisations_bio: sum('nb_signalisations_bio'),
            nb_mis_en_cause_bio: sum('nb_mis_en_cause_bio'),

            nb_transports_vpe: sum('nb_transports_vpe'),
            faits_vpe: sum('faits_vpe'),
            nb_transports_dvv: sum('nb_transports_dvv'),
            faits_dvv: sum('faits_dvv'),
            nb_transports_vr: sum('nb_transports_vr'),
            faits_vr: sum('faits_vr'),
            nb_transports_dm: sum('nb_transports_dm'),
            faits_dm: sum('faits_dm'),
        };

        // Rates (Calculated)
        res.taux_papillaires = res.nb_mis_en_cause_pap ? res.nb_signalisations_pap / res.nb_mis_en_cause_pap : 0;
        res.taux_genetiques = res.nb_mis_en_cause_bio ? res.nb_signalisations_bio / res.nb_mis_en_cause_bio : 0;

        res.taux_vpe = res.nb_transports_vpe ? res.faits_vpe / res.nb_transports_vpe : 0;
        res.taux_dvv = res.nb_transports_dvv ? res.faits_dvv / res.nb_transports_dvv : 0;
        res.taux_vr = res.nb_transports_vr ? res.faits_vr / res.nb_transports_vr : 0;
        res.taux_dm = res.nb_transports_dm ? res.faits_dm / res.nb_transports_dm : 0;

        return res;
    };

    return {
        current: calc(currentRecords),
        ytd: calc(ytdRecords),
        rolling: calc(rollingRecords)
    };
}

function getRollingData(records, year, month, count) {
    const labels = [];
    const values = {
        taux_papillaires: [], taux_genetiques: [],
        taux_vpe: [], taux_dvv: [], taux_vr: [], taux_dm: []
    };

    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const lbl = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        labels.push(lbl);

        const rec = records.find(r => {
            const rd = new Date(r.date);
            return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
        });

        const safeDiv = (n, d) => (d ? (n / d) * 100 : 0);
        const r = rec || {};

        values.taux_papillaires.push(safeDiv(Number(r.nb_signalisations_pap || 0), Number(r.nb_mis_en_cause_pap || 0)));
        values.taux_genetiques.push(safeDiv(Number(r.nb_signalisations_bio || 0), Number(r.nb_mis_en_cause_bio || 0)));

        values.taux_vpe.push(safeDiv(Number(r.faits_vpe || 0), Number(r.nb_transports_vpe || 0)));
        values.taux_dvv.push(safeDiv(Number(r.faits_dvv || 0), Number(r.nb_transports_dvv || 0)));
        values.taux_vr.push(safeDiv(Number(r.faits_vr || 0), Number(r.nb_transports_vr || 0)));
        values.taux_dm.push(safeDiv(Number(r.faits_dm || 0), Number(r.nb_transports_dm || 0)));
    }

    return { labels, values };
}

function formatPercent(val) {
    return (Number(val || 0) * 100).toFixed(1) + '%';
}

// Chart.js instance keeper to destroy old charts
const charts = {};

function renderChart(canvasId, label, labels, data, goal) {
    return new Promise((resolve) => {
        const ctx = document.getElementById(canvasId).getContext('2d');

        if (charts[canvasId]) charts[canvasId].destroy();

        // Plugin to set white background (required for JPEG export)
        const whiteBackground = {
            id: 'whiteBackground',
            beforeDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, chart.width, chart.height);
                ctx.restore();
            }
        };

        const datasets = [{
            label: label,
            data: data,
            borderColor: '#16a085',
            backgroundColor: 'rgba(22, 160, 133, 0.2)',
            tension: 0.4,
            fill: true
        }];

        if (goal !== undefined && goal !== null) {
            datasets.push({
                label: 'Objectif',
                data: Array(labels.length).fill(goal * 100), // Scale objective to %
                borderColor: '#e74c3c',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            });
        }

        charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [whiteBackground],
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'line'
                        }
                    },
                    title: {
                        display: true,
                        text: label,
                        font: { size: 16 }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        // Wait a tick for render
        setTimeout(() => {
            resolve(document.getElementById(canvasId).toDataURL('image/jpeg', 0.7));
        }, 100);
    });
}
