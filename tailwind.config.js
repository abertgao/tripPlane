export default {
  content: ['./index.html', './src/qin/**/*.{js,css}'],
  theme: {
    extend: {
      colors: {
        ink: '#161b16',
        paper: '#f4efe3',
        bronze: '#a86f32',
        moss: '#526044',
        cinnabar: '#b94b35',
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'STSong', 'serif'],
        sans: ['Inter', 'PingFang SC', 'sans-serif'],
      },
      boxShadow: { seal: '0 16px 50px rgba(42, 35, 25, .14)' },
      opacity: { 45: '.45' },
    },
  },
}
