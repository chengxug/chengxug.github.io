//-----------------------------------------------高亮当前页面的导航项-----------------------
const currentUrl = window.location.pathname;
// 获取所有导航菜单项
const navItems = document.querySelectorAll('.nav_menu_item');

// 遍历导航菜单项，找到与当前 URL 匹配的项，并高亮显示
navItems.forEach(item => {
    if (item.getAttribute('href') === currentUrl) {
        item.style.color = '#FFFFFF'; // 高亮当前页面链接
    }
});

// --------------------------------------------------------实现侧边栏的展开和收回功能------------------------
// const toggleButton = document.getElementById('toggle-sidebar');
// const sidebar = document.querySelector('.sidenav');

// toggleButton.addEventListener('click', function() {
//     sidebar.classList.toggle('collapsed');
// });