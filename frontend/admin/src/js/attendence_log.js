document.addEventListener("DOMContentLoaded", () => {
    let allAttendanceData = [];

    function getApiBase() {
        if (window.API_BASE_URL) return window.API_BASE_URL;
        if (window.location.port === '8000') return '';
        return 'http://127.0.0.1:8000';
    }

    // 1. Backend API कडून डेटा फेच करणे
    async function fetchAttendanceLogs(filter = 'day') {
        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/api/admin/attendance-logs?filter=${filter}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch attendance data');
            }

            allAttendanceData = await response.json();
            renderTable(allAttendanceData);

        } catch (error) {
            console.error("Backend connection error:", error);
            document.getElementById('attendance-table-body').innerHTML = `
                <tr><td colspan="5" class="py-8 text-center text-red-500">Could not connect to backend server.</td></tr>
            `;
        }
    }

    // 2. टेबल डेटा रेंडर (Render) करण्याचे फंक्शन
    function renderTable(data) {
        const tableBody = document.getElementById('attendance-table-body');
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">No records found.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(item => {
            const isPresent = (item.status || '').toLowerCase() === 'present';
            const statusBadgeClass = isPresent 
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' 
                : 'bg-blue-50 text-blue-600 border border-blue-200/60';

            const seatDisplay = (item.seatCode && item.seatCode !== 'General Entry')
                ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/70">
                    <i class="fa-solid fa-chair text-blue-500"></i> ${item.seatCode}
                   </span>`
                : `<span class="text-slate-400 text-[11px] italic">General Entry</span>`;

            return `
                <tr class="hover:bg-slate-50/60 transition">
                    <td class="py-3.5 px-6 font-bold text-slate-800">${item.studentName}</td>
                    <td class="py-3.5 px-6 text-slate-600 font-mono">${item.rollNo}</td>
                    <td class="py-3.5 px-6 text-slate-600">${item.date}</td>
                    <td class="py-3.5 px-6">${seatDisplay}</td>
                    <td class="py-3.5 px-6 text-slate-600 font-mono">${item.checkIn || '-'}</td>
                    <td class="py-3.5 px-6 text-slate-600 font-mono">${item.checkOut || '-'}</td>
                    <td class="py-3.5 px-6">
                        <span class="${statusBadgeClass} px-3 py-1 rounded-full text-[10px] font-bold tracking-wide inline-block text-center min-w-[70px]">
                            ${item.status || 'PRESENT'}
                        </span>
                    </td>
                    <td class="py-3.5 px-6">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            <i class="fa-solid fa-barcode text-slate-400"></i> ${item.verificationMethod || 'BARCODE'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 3. Search Bar फंक्शनॅलिटी (नाव किंवा रोल नंबरनुसार फिल्टर करणे)
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        const filteredData = allAttendanceData.filter(item => 
            item.studentName.toLowerCase().includes(searchText) || 
            item.rollNo.toString().toLowerCase().includes(searchText)
        );
        renderTable(filteredData);
    });

    // 4. Day / Week / Month Filter Buttons हाताळणे
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterButtons.forEach(b => {
                b.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
                b.classList.add('text-slate-600');
            });
            e.target.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            e.target.classList.remove('text-slate-600');

            const selectedFilter = e.target.getAttribute('data-filter');
            fetchAttendanceLogs(selectedFilter);
        });
    });

    // पेज लोड झाल्यावर सुरुवातीला 'Day' डेटा लोड करणे
    fetchAttendanceLogs('day');
});