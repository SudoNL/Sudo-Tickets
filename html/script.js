// Initialize flatpickr date pickers
flatpickr("#startdatum", {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d-m-Y",
    locale: "nl"
});
flatpickr("#eindatum", {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d-m-Y",
    locale: "nl"
});

document.getElementById('signoff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('message');
    const formData = new FormData(e.target);
    const data = {
        naam: formData.get('naam'),
        startdatum: formData.get('startdatum'),
        eindatum: formData.get('eindatum'),
        reden: formData.get('reden')
    };

    try {
        const response = await fetch('/signoff', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.text();
        messageEl.textContent = result;
        messageEl.style.color = response.ok ? 'green' : 'red';
        if (response.ok) {
            e.target.reset();
        }
    } catch (error) {
        messageEl.textContent = 'Fout bij afmelden.';
        messageEl.style.color = 'red';
        console.error('Error:', error);
    }
});