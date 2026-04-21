class AttendanceSystem {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.codeReader = null;
        this.isScanning = false;
        this.employeeId = localStorage.getItem('employeeId') || '';
        this.employeeName = localStorage.getItem('employeeName') || '';
        this.sheetsUrl = localStorage.getItem('sheetsUrl') || '';
        this.attendanceData = JSON.parse(localStorage.getItem('attendanceData')) || [];
        this.todayStatus = null;

        this.init();
    }

    async init() {
        // Load employee info
        if (this.employeeId) {
            document.getElementById('employeeId').value = this.employeeId;
            document.getElementById('employeeName').value = this.employeeName;
        }

        // Initialize camera
        await this.startCamera();
        this.startQRScanner();

        // Load today's status and reports
        this.loadTodayStatus();
        this.loadReport();

        // Set default report date to today
        document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            this.video.srcObject = stream;
        } catch (err) {
            console.error('Error accessing camera:', err);
            this.showStatus('Gagal mengakses kamera', 'error');
        }
    }

    startQRScanner() {
        this.codeReader = new ZXing.BrowserMultiFormatReader();
        this.scanContinuously();
    }

    async scanContinuously() {
        if (!this.isScanning) {
            this.isScanning = true;
            const codeReader = this.codeReader;
            
            const scanResult = await codeReader.decodeFromVideoDevice(
                null, 
                'video', 
                (result, err) => {
                    if (result) {
                        console.log('QR Code detected:', result.text);
                        this.handleQRScan(result.text);
                        this.isScanning = false;
                    }
                    if (err && !(err instanceof ZXing.NotFoundException)) {
                        console.error(err);
                    }
                }
            );
        }
    }

    handleQRScan(qrData) {
        const data = qrData.split('|');
        if (data.length >= 2) {
            document.getElementById('employeeId').value = data[0];
            document.getElementById('employeeName').value = data[1];
            this.saveEmployeeInfo();
            this.showStatus(`ID: ${data[0]} - ${data[1]} terdeteksi!`, 'success');
        }
    }

    saveEmployeeInfo() {
        this.employeeId = document.getElementById('employeeId').value;
        this.employeeName = document.getElementById('employeeName').value;
        
        localStorage.setItem('employeeId', this.employeeId);
        localStorage.setItem('employeeName', this.employeeName);
        
        this.showStatus('Data karyawan tersimpan!', 'success');
    }

    async checkIn() {
        if (!this.employeeId || !this.employeeName) {
            this.showStatus('Mohon input ID dan Nama terlebih dahulu!', 'error');
            return;
        }

        const attendance = {
            id: this.employeeId,
            name: this.employeeName,
            checkIn: new Date().toISOString(),
            checkOut: null,
            date: new Date().toISOString().split('T')[0]
        };

        // Check if already checked in today
        const today = attendance.date;
        const todayRecord = this.attendanceData.find(record => 
            record.id === this.employeeId && record.date === today
        );

        if (todayRecord) {
            this.showStatus('Sudah Check In hari ini!', 'error');
            return;
        }

        this.attendanceData.unshift(attendance);
        localStorage.setItem('attendanceData', JSON.stringify(this.attendanceData));
        
        await this.sendToGoogleSheets(attendance, 'CHECK_IN');
        this.updateTodayStatus();
        this.loadReport();
        
        this.showStatus('✅ Check In berhasil!', 'success');
        document.getElementById('checkOutBtn').disabled = false;
    }

    async checkOut() {
        if (!this.employeeId) {
            this.showStatus('Mohon input ID karyawan!', 'error');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const todayRecord = this.attendanceData.find(record => 
            record.id === this.employeeId && record.date === today
        );

        if (!todayRecord || todayRecord.checkOut) {
            this.showStatus('Belum Check In hari ini atau sudah Check Out!', 'error');
            return;
        }

        todayRecord.checkOut = new Date().toISOString();
        todayRecord.workHours = this.calculateWorkHours(todayRecord.checkIn, todayRecord.checkOut);
        
        localStorage.setItem('attendanceData', JSON.stringify(this.attendanceData));
        await this.sendToGoogleSheets(todayRecord, 'CHECK_OUT');
        
        this.updateTodayStatus();
        this.loadReport();
        
        this.showStatus('🚪 Check Out berhasil!', 'success');
        document.getElementById('checkOutBtn').disabled = true;
    }

    calculateWorkHours(checkIn, checkOut) {
        const inTime = new Date(checkIn);
        const outTime = new Date(checkOut);
        const diffMs = outTime - inTime;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    async sendToGoogleSheets(data, type) {
        if (!this.sheetsUrl) return;

        try {
            const payload = {
                timestamp: new Date().toISOString(),
                employeeId: data.id,
                employeeName: data.name,
                type: type,
                date: data.date,
                time: type === 'CHECK_IN' ? data.checkIn : data.checkOut,
                ...(type === 'CHECK_OUT' && { workHours: data.workHours })
            };

            await fetch(this.sheetsUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error('Error sending to Google Sheets:', err);
        }
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.textContent = message;
        statusDiv.className = `status-${type}`;
        statusDiv.style.opacity = '1';
        
        setTimeout(() => {
            statusDiv.style.opacity = '0';
        }, 5000);
    }

    updateTodayStatus() {
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = this.attendanceData.find(record => 
            record.id === this.employeeId && record.date === today
        );

        const statusDiv = document.getElementById('todayAttendance');
        if (todayRecord) {
            const status = todayRecord.checkOut ? 
                `✅ Selesai - ${todayRecord.workHours}` : 
                `⏰ Check In: ${new Date(todayRecord.checkIn).toLocaleTimeString('id-ID')}`;
            statusDiv.innerHTML = `<strong>Status Hari Ini:</strong> ${status}`;
            document.getElementById('checkOutBtn').disabled = !!todayRecord.checkOut;
        } else {
            statusDiv.textContent = 'Belum Check In hari ini';
        }
    }

    loadTodayStatus() {
        this.updateTodayStatus();
    }

    loadReport() {
        const date = document.getElementById('reportDate').value;
        const type = document.getElementById('reportType').value;
        
        let filteredData = this.attendanceData;
        
        if (type === 'daily') {
            filteredData = this.attendanceData.filter(record => record.date === date);
        } else if (type === 'monthly') {
            const reportDate = new Date(date + 'T00:00:00');
            const yearMonth = reportDate.toISOString().slice(0, 7);
            filteredData = this.attendanceData.filter(record => 
                record.date.slice(0, 7) === yearMonth
            );
        }

        this.renderReportTable(filteredData);
        this.renderChart(filteredData);
    }

        renderReportTable(data) {
        const tableDiv = document.getElementById('reportTable');
        
        if (data.length === 0) {
            tableDiv.innerHTML = '<p style="text-align: center; color: #666;">Tidak ada data absensi</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID Karyawan</th>
                        <th>Nama</th>
                        <th>Tanggal</th>
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Jam Kerja</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(record => {
            const checkInTime = record.checkIn ? new Date(record.checkIn).toLocaleTimeString('id-ID') : '-';
            const checkOutTime = record.checkOut ? new Date(record.checkOut).toLocaleTimeString('id-ID') : '-';
            const workHours = record.workHours || '-';
            const status = record.checkOut ? '✅ Lengkap' : '⚠️ Belum Check Out';

            html += `
                <tr>
                    <td><strong>${record.id}</strong></td>
                    <td>${record.name}</td>
                    <td>${record.date}</td>
                    <td>${checkInTime}</td>
                    <td>${checkOutTime}</td>
                    <td>${workHours}</td>
                    <td>${status}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        tableDiv.innerHTML = html;
    }

    renderChart(data) {
        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        // Destroy existing chart if exists
        if (window.attendanceChart) {
            window.attendanceChart.destroy();
        }

        if (data.length === 0) return;

        const labels = data.map(record => record.date || 'N/A');
        const presentCount = data.filter(record => record.checkIn).length;
        const completeCount = data.filter(record => record.checkOut).length;

        window.attendanceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Hadir', 'Lengkap (Check Out)', 'Tidak Hadir'],
                datasets: [{
                    data: [presentCount, completeCount, Math.max(0, 10 - presentCount)],
                    backgroundColor: ['#48bb78', '#4299e1', '#f56565'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    exportReport() {
        const date = document.getElementById('reportDate').value;
        const type = document.getElementById('reportType').value;
        
        let filteredData = this.attendanceData;
        
        if (type === 'daily') {
            filteredData = this.attendanceData.filter(record => record.date === date);
        } else if (type === 'monthly') {
            const reportDate = new Date(date + 'T00:00:00');
            const yearMonth = reportDate.toISOString().slice(0, 7);
            filteredData = this.attendanceData.filter(record => 
                record.date.slice(0, 7) === yearMonth
            );
        }

        const wsData = [['ID Karyawan', 'Nama', 'Tanggal', 'Check In', 'Check Out', 'Jam Kerja', 'Status']];
        
        filteredData.forEach(record => {
            const checkInTime = record.checkIn ? new Date(record.checkIn).toLocaleString('id-ID') : '';
            const checkOutTime = record.checkOut ? new Date(record.checkOut).toLocaleString('id-ID') : '';
            const workHours = record.workHours || '';
            const status = record.checkOut ? 'Lengkap' : 'Belum Check Out';
            
            wsData.push([record.id, record.name, record.date, checkInTime, checkOutTime, workHours, status]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan Absensi');
        
        const fileName = `Laporan_Absensi_${date}_${type}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    printReport() {
        const printContent = document.querySelector('.reports-section').innerHTML;
        const originalContent = document.body.innerHTML;
        
        document.body.innerHTML = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
                <h1 style="text-align: center; color: #333;">Laporan Absensi</h1>
                ${printContent}
            </div>
            <script>window.print(); window.close();</script>
        `;
        
        window.print();
        document.body.innerHTML = originalContent;
        location.reload();
    }

    showSheetsModal() {
        document.getElementById('sheetsModal').style.display = 'block';
    }

    saveSheetsUrl() {
        this.sheetsUrl = document.getElementById('sheetsUrl').value;
        localStorage.setItem('sheetsUrl', this.sheetsUrl);
        this.closeModal();
        this.showStatus('URL Google Sheets tersimpan!', 'success');
    }

    closeModal() {
        document.getElementById('sheetsModal').style.display = 'none';
    }
}

// Initialize system
const attendanceSystem = new AttendanceSystem();

// Global functions for HTML onclick
function saveEmployeeInfo() {
    attendanceSystem.saveEmployeeInfo();
}

function checkIn() {
    attendanceSystem.checkIn();
}

function checkOut() {
    attendanceSystem.checkOut();
}

function loadReport() {
    attendanceSystem.loadReport();
}

function exportReport() {
    attendanceSystem.exportReport();
}

function printReport() {
    attendanceSystem.printReport();
}

function showSheetsModal() {
    attendanceSystem.showSheetsModal();
}

function saveSheetsUrl() {
    attendanceSystem.saveSheetsUrl();
}

function closeModal() {
    attendanceSystem.closeModal();
}

// Add button to header for Google Sheets setup
document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('header');
    const sheetsBtn = document.createElement('button');
    sheetsBtn.textContent = '⚙️ Setup Google Sheets';
    sheetsBtn.onclick = showSheetsModal;
    sheetsBtn.style.cssText = `
        padding: 10px 15px;
        background: #ed8936;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
    `;
    header.appendChild(sheetsBtn);
});

// Modal backdrop click to close
window.onclick = function(event) {
    const modal = document.getElementById('sheetsModal');
    if (event.target === modal) {
        attendanceSystem.closeModal();
    }
};

            
