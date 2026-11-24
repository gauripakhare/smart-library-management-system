document.addEventListener("DOMContentLoaded", async () => {
    function getApiBase() {
        if (window.API_BASE_URL) return window.API_BASE_URL;
        if (window.location.port === '8000') return '';
        return 'http://127.0.0.1:8000';
    }

    try {
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/admin/attendance-overview`);
        
        if (!response.ok) {
            throw new Error('Server varun data fetch करण्यात अपयश आले.');
        }

        const data = await response.json();

        // 1. Header किंवा Subtitle मधील तारीख सेट करणे
        if (data.currentDate) {
            document.getElementById('current-date-text').innerText = data.currentDate;
        } else {
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            document.getElementById('current-date-text').innerText = new Date().toLocaleDateString('en-US', options);
        }

        // 2. Stat Cards मधील डायनॅमिक डेटा भरणे
        document.getElementById('stat-total-students').innerText = data.stats.totalStudents;
        document.getElementById('stat-present-today').innerText = data.stats.presentToday;
        document.getElementById('stat-absent-today').innerText = data.stats.absentToday;
        document.getElementById('stat-avg-attendance').innerText = data.stats.avgAttendance30d + '%';

        // 3. Bar Chart तयार करणे (Chart.js द्वारे)
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.chartData.labels, // बॅकएंडवरून येणारे दिवस (उदा. Mon, Tue...)
                datasets: [{
                    data: data.chartData.values,   // बॅकएंडवरून येणाऱ्या व्हॅल्यूज
                    backgroundColor: '#2563eb',
                    borderRadius: 8,
                    barThickness: 45,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Database/Backend connection error:", error);
    }
});