const paths={
  heart:'M20 5a5 5 0 0 0-7 .3L12 6.5l-1.1-1.2A5 5 0 0 0 3.5 12L12 20.2l8.5-8.2a5 5 0 0 0-.5-7z',
  book:'M3 5c3-1 6.5-.5 9 1.2C14.5 4.5 18 4 21 5v13c-3-1-6.5-.5-9 1.2C9.5 17.5 6 17 3 18z M12 6.2v13',
  paper:'M6 3h9l4 4v14H6z M15 3v5h4 M9 12h7 M9 16h5',
  bookmark:'M6 4h12v17l-6-4-6 4z M9 9h6',
  calendar:'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  device:'M3 5h18v12H3z M8 21h8 M12 17v4',
  monitor:'M3 4.5h18v14H3z M9 21h6 M12 18.5V21',
  sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
  moon:'M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z',
  down:'m6 9 6 6 6-6',min:'M4 12h16',maximize:'M5 5h14v14H5z',close:'m6 6 12 12 M18 6 6 18',
  grid:'M3.5 3.5h6v6h-6z M14.5 3.5h6v6h-6z M3.5 14.5h6v6h-6z M14.5 14.5h6v6h-6z',
  progress:'M4 20V13 M10 20V8 M16 20V4 M2 20h18',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v5l3.5 2',
  right:'m5 12 4.5 4.5L19 7',wrong:'m7 7 10 10 M17 7 7 17',
  correct:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z m-13 0 2.7 2.7 5.8-5.8',
  mistake:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M9 9l6 6 M15 9l-6 6',
  empty:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',marked:'M4 4h16v16H4z m3.5 8 3 3 6-6',
  current:'M5 5h14v14H5z M9 12h6',left:'m14.5 5-7 7 7 7',next:'m9.5 5 7 7-7 7',
  slash:'m16 3-8 18',send:'m3 10 18-7-7 18-2.8-8.2z M11.2 12.8 20 4',replay:'M4 11a8 8 0 1 1 1.6 6 M4 5v6h6',
  list:'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01',
  multiple:'M8 4h12v13 M4 8h12v13H4z m3 6 2 2 4-4',award:'M16.5 8.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z M9 12l-2 8 5-3 5 3-2-8',
  swap:'M3 7h3c4 0 7 10 11 10h4 M18 14l3 3-3 3 M3 17h3c2 0 3-2 4-4 M14 8c1-1 2-1 4-1h3 M18 4l3 3-3 3'
};
const ns='http://www.w3.org/2000/svg';
export function icon(name,extra=''){
  const s=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
  s.setAttribute('class','ic '+extra);s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');p.setAttribute('d',paths[name]);s.append(p);return s;
}
export function questionText(text){
  const fragment=document.createDocumentFragment();
  const empty=/[（(][\s\u200b\ufeff]*[)）]/gu;
  let prior=0;
  for(const match of text.matchAll(empty)){
    fragment.append(text.slice(prior,match.index));
    const s=document.createElementNS(ns,'svg'),line=document.createElementNS(ns,'line');
    s.setAttribute('class','blank-line');s.setAttribute('viewBox','0 0 60 16');s.setAttribute('preserveAspectRatio','none');
    s.setAttribute('role','img');s.setAttribute('aria-label','填空处');
    line.setAttribute('x1','2');line.setAttribute('x2','58');line.setAttribute('y1','13');line.setAttribute('y2','13');s.append(line);fragment.append(s);
    prior=match.index+match[0].length;
  }
  fragment.append(text.slice(prior));return fragment;
}
