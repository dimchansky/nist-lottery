// Initialize Vue Toasted plugin
Vue.use(Toasted, {
    position: 'top-center',
    iconPack: 'fontawesome', // Use Font Awesome for icons
});

new Vue({
    el: '#app',
    data: {
        date: '',
        time: '',
        participants: null,
        isLoading: false,
        message: '',
        messageClass: '',
        nistData: null, // Stores NIST data

        // Properties for displaying results
        outputValue: '',
        nistUrl: '',
        codeExample: '',
        winnerNumber: '',
    },
    mounted() {
        this.initializeFormFromURL();
        this.initializeFlatpickr();
    },
    watch: {
        // Watch for changes in date, time, and participants to update URL parameters
        date() {
            this.updateURLParameters();
            this.nistData = null; // Reset NIST data when date changes
        },
        time() {
            this.updateURLParameters();
            this.nistData = null; // Reset NIST data when time changes
        },
        participants() {
            this.updateURLParameters();
            // Recalculate winner if NIST data is already loaded
            if (this.nistData) {
                this.calculateWinner(this.nistData);
            }
        },
    },
    methods: {
        /**
         * Initialize form fields from URL parameters
         */
        initializeFormFromURL() {
            const params = new URLSearchParams(window.location.search);

            this.date = params.get('date') || this.formatDate(new Date());
            this.time = params.get('time') || '';
            this.participants = params.get('participants') ? parseInt(params.get('participants')) : null;
        },
        /**
         * Initialize Flatpickr date picker
         */
        initializeFlatpickr() {
            const locale = flatpickr.l10ns[(navigator.language || 'en').split('-')[0]] || flatpickr.l10ns.default;
            locale.firstDayOfWeek = 1;

            const fp = flatpickr("#date", {
                dateFormat: "Y-m-d",
                altInput: true,
                altFormat: "Y-m-d",
                allowInput: true,
                placeholder: "YYYY-MM-DD",
                locale: locale,
                onChange: (selectedDates, dateStr) => {
                    this.date = dateStr;
                },
            });

            // Set initial date in Flatpickr
            if (this.date) {
                fp.setDate(this.date, false, "Y-m-d");
            } else {
                fp.setDate(new Date());
            }
        },
        /**
         * Update URL parameters based on form fields
         */
        updateURLParameters() {
            const params = new URLSearchParams();

            if (this.date) params.set('date', this.date);
            if (this.time) params.set('time', this.time);
            if (this.participants) params.set('participants', this.participants);

            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', newUrl);
        },
        /**
         * Handle form submission and initiate calculation
         */
        handleFormSubmit() {
            // Validate that all fields are filled
            if (!this.date || !this.time || !this.participants) {
                this.displayMessage('Please fill in all fields.', 'alert alert-danger');
                return;
            }

            // Validate that participants is a positive integer
            if (!Number.isInteger(this.participants) || this.participants < 1) {
                this.displayMessage('The number of participants must be a positive integer.', 'alert alert-danger');
                return;
            }

            // Validate date format (YYYY-MM-DD)
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(this.date)) {
                this.displayMessage('Invalid date format. Please use YYYY-MM-DD.', 'alert alert-danger');
                return;
            }

            // Validate time format (HH:MM)
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (!timeRegex.test(this.time)) {
                this.displayMessage('Invalid time format. Please use HH:MM (24-hour format).', 'alert alert-danger');
                return;
            }

            // Reset results and start loading
            this.isLoading = true;
            this.resetResults();

            // Create ISO datetime string and parse to Date object
            const dateTimeString = `${this.date}T${this.time}Z`;
            const dateTime = new Date(dateTimeString);

            // Check if dateTime is valid
            if (isNaN(dateTime.getTime())) {
                this.displayMessage('Invalid date or time.', 'alert alert-danger');
                this.isLoading = false;
                return;
            }

            // Get Unix timestamp
            const unixTimestamp = dateTime.getTime();

            // Use cached NIST data if available
            if (this.nistData && this.nistData.unixTimestamp === unixTimestamp) {
                this.calculateWinner(this.nistData);
            } else {
                this.getRandomData(unixTimestamp);
            }
        },
        /**
         * Fetch random data from NIST and calculate winner
         */
        getRandomData(unixTimestamp) {
            const nistUrl = `https://beacon.nist.gov/beacon/2.0/pulse/time/${unixTimestamp}`;

            fetch(nistUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Data not found for the specified time. Please try another time.');
                    }
                    return response.json();
                })
                .then(data => {
                    this.nistData = {
                        outputValue: data.pulse.outputValue,
                        unixTimestamp: unixTimestamp,
                        nistUrl: nistUrl,
                    };
                    this.calculateWinner(this.nistData);
                })
                .catch(error => {
                    this.displayMessage('Error: ' + error.message, 'alert alert-danger');
                })
                .finally(() => {
                    this.isLoading = false;
                });
        },
        /**
         * Calculate the winner based on NIST data and number of participants
         */
        calculateWinner(nistData) {
            try {
                const outputValue = nistData.outputValue;
                const nistUrl = nistData.nistUrl;

                // Convert the NIST hex output to BigInt
                const R = BigInt('0x' + outputValue);

                // Define MAX as 2^512 - 1 using BigInt
                const MAX = (1n << 512n) - 1n;

                // Get the number of participants as BigInt
                const participantsCount = BigInt(this.participants);

                // Calculate winnerNumber using the formula:
                // floor((R * participantsCount) / (MAX + 1)) + 1
                const winnerNumber = (R * participantsCount) / (MAX + 1n) + 1n;

                // Prepare the code example for users
                const codeExample = `const R = BigInt('0x${outputValue}');
const MAX = (1n << 512n) - 1n;
const participantsCount = ${participantsCount.toString()}n;

const winnerNumber = (R * participantsCount) / (MAX + 1n) + 1n;
console.log('Winner number:', winnerNumber.toString());`;

                // Set result properties
                this.outputValue = outputValue;
                this.nistUrl = nistUrl;
                this.codeExample = codeExample.trim();
                this.winnerNumber = winnerNumber.toString();

                // Clear any error messages
                this.message = '';
                this.messageClass = '';
            } catch (error) {
                this.displayMessage('Error during calculation: ' + error.message, 'alert alert-danger');
            } finally {
                this.isLoading = false;
            }
        },
        /**
         * Display a message to the user
         */
        displayMessage(message, messageClass) {
            this.resetResults();
            this.message = message;
            this.messageClass = `mt-4 ${messageClass}`;
        },
        /**
         * Copy code example to clipboard
         */
        copyCode() {
            const codeElement = this.$refs.codeExample;
            const codeText = codeElement.innerText;

            navigator.clipboard.writeText(codeText).then(() => {
                this.$toasted.show('Code copied to clipboard!', {
                    type: 'success',
                    duration: 3000,
                    icon: 'check-circle', // Font Awesome icon name
                });
            }, (err) => {
                this.$toasted.show('Failed to copy code: ' + err, {
                    type: 'error',
                    duration: 5000,
                    icon: 'exclamation-triangle',
                });
            });
        },
        /**
         * Format a Date object to YYYY-MM-DD string
         */
        formatDate(date) {
            const year = date.getFullYear();
            const month = ('0' + (date.getMonth() + 1)).slice(-2);
            const day = ('0' + date.getDate()).slice(-2);
            return `${year}-${month}-${day}`;
        },
        /**
         * Reset result properties to their initial state
         */
        resetResults() {
            this.outputValue = '';
            this.nistUrl = '';
            this.codeExample = '';
            this.winnerNumber = '';
            this.message = '';
            this.messageClass = '';
        },
    },
});