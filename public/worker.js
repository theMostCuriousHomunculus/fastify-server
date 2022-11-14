let array = [];

self.addEventListener(
  'message',
  ({ data }) => {
    if (data === 'download') {
      const blob = new Blob(array);
      self.postMessage(blob);
      array = [];
    } else {
      array.push(data);
    }
  },
);