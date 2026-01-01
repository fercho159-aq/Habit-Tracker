self.onmessage = function (e) {
    if (e.data === 'start') {
        // Simple tick every second
        self.timerId = setInterval(() => {
            self.postMessage('tick');
        }, 1000);
    } else if (e.data === 'stop') {
        if (self.timerId) {
            clearInterval(self.timerId);
            self.timerId = null;
        }
    }
};
