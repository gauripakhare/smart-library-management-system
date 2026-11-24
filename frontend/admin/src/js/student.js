document.addEventListener("DOMContentLoaded", () => {
    let allStudentsData = [];

    function getApiBase() {
        if (window.API_BASE_URL) return window.API_BASE_URL;
        if (window.location.port === '8000') return '';
        return 'http://127.0.0.1:8000';
    }

    // 1. Fetch students attendance data from backend API
    async function fetchStudentsData() {
        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/api/admin/attendance-students`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch students data');
            }

            const data = await response.json();
            allStudentsData = Array.isArray(data) ? data : (data.students || []);
            renderStudentsTable(allStudentsData);

        } catch (error) {
            console.error("Backend connection error:", error);
            document.getElementById('students-table-body').innerHTML = `
                <tr><td colspan="4" class="py-8 text-center text-red-500">Could not connect to backend server.</td></tr>
            `;
        }
    }

    // 2. Render students table rows
    function renderStudentsTable(data) {
        const tableBody = document.getElementById('students-table-body');
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">No students found.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(student => {
            const isPresent = (student.todayStatus || '').toLowerCase() === 'present';
            const statusBadgeClass = isPresent 
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' 
                : 'bg-red-50 text-red-600 border border-red-200/60';

            const attendancePercent = student.attendance30Days !== undefined ? student.attendance30Days : 0;
            const rollNumber = student.rollNo || student.rollNumber || '-';
            const studentName = student.studentName || student.name || 'Student';

            return `
                <tr class="hover:bg-slate-50/60 transition cursor-pointer" onclick="viewStudentProfile('${rollNumber}')">
                    <td class="py-3.5 px-6 font-medium text-slate-800">${studentName}</td>
                    <td class="py-3.5 px-6 text-slate-600 font-mono">${rollNumber}</td>
                    <td class="py-3.5 px-6 text-slate-700 font-semibold">${attendancePercent}%</td>
                    <td class="py-3.5 px-6">
                        <span class="${statusBadgeClass} px-3 py-1 rounded-full text-[10px] font-bold tracking-wide inline-block text-center min-w-[70px]">
                            ${student.todayStatus || 'Absent'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 3. Search Bar filter functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchText = e.target.value.toLowerCase();
            const filteredData = allStudentsData.filter(student => {
                const name = (student.studentName || student.name || '').toLowerCase();
                const roll = (student.rollNo || student.rollNumber || '').toString().toLowerCase();
                return name.includes(searchText) || roll.includes(searchText);
            });
            renderStudentsTable(filteredData);
        });
    }

    fetchStudentsData();
});

function viewStudentProfile(rollNo) {
    if (rollNo && rollNo !== '-') {
        window.location.href = `student-details.html?id=${encodeURIComponent(rollNo)}`;
    }
}