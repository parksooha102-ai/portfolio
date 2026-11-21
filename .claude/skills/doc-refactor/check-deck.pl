# check-deck.pl — 슬라이드 데이터(data/projects/<id>.json)가 프로젝트 문서와 맞는지 확인 (python 없이 Git Bash perl로)
# 사용: perl .claude/skills/doc-refactor/check-deck.pl data/projects/<id>.json src/<id>/<문서>.md .
# 확인: 절 제목 존재(코드 블록 밖) · sectionPath 마지막 제목 중복 · key 중복 · verbatim:true 글의 부분 문자열 · 이미지 파일 존재
# 마지막 줄이 OK면 통과, BAD n이면 위 줄들을 고친 뒤 다시. 최종 판정은 미리보기 PFScene.report().audit 0건.
use strict; use warnings; use utf8; use JSON::PP;
binmode STDOUT, ':encoding(UTF-8)';
my ($jf, $mf, $root) = @ARGV;
local $/; open my $J, '<:raw', $jf or die; my $d = JSON::PP->new->utf8->decode(<$J>); close $J;
open my $M, '<:encoding(UTF-8)', $mf or die; my $md = <$M>; close $M; $md =~ s/\r//g;
my @lines = split /\n/, $md;
# headings outside fences
my (@heads, $fence); my $i = 0;
for my $l (@lines) { if ($l =~ /^```/) { $fence = !$fence } elsif (!$fence && $l =~ /^(#{1,6})\s+(.*?)\s*$/) { push @heads, [length $1, $2, $i] } $i++ }
my %cnt; $cnt{$_->[1]}++ for @heads;
sub norm { my $s = shift; $s =~ s/[*_`]//g; $s =~ s/\s+/ /g; $s =~ s/^ | $//g; $s }
# section range text (heading line to next heading of any level, sub-sections excluded) — for verbatim use whole section incl. subsections
sub range { my ($title) = @_; for my $k (0..$#heads) { next unless $heads[$k][1] eq $title; my $s = $heads[$k][2]; my $lv = $heads[$k][0]; my $e = $#lines;
  for my $m ($k+1..$#heads) { if ($heads[$m][0] <= $lv) { $e = $heads[$m][2]-1; last } } return join("\n", @lines[$s..$e]); } return undef }
my $bad = 0;
sub chk_sec { my ($t, $where) = @_; if (!$cnt{$t}) { print "NO HEADING: $t ($where)\n"; $bad++ } }
for my $h (@{$d->{highlights}}) { chk_sec($h->{section}, 'highlight') }
for my $t (@{$d->{troubleshooting}}) { chk_sec($t->{section}, 'ts') }
chk_sec($d->{retro}{section}, 'retro');
for my $c (@{$d->{deck}{chapters}}) { chk_sec($_, "chapter $c->{key}") for @{$c->{sectionPath}} }
my %keys;
for my $s (@{$d->{deck}{slides}}) {
  my $sp = $s->{sectionPath}; chk_sec($_, "slide $s->{key}") for @$sp;
  print "DUP KEY $s->{key}\n" if $keys{$s->{key}}++;
  my $last = $sp->[-1]; print "AMBIG $last ($s->{key})\n" if ($cnt{$last}||0) > 1;
  my $txt = norm(range($last) // '');
  my @frag;
  push @frag, ['title', $s->{title}] if $s->{title};
  push @frag, ['lead', $s->{lead}] if $s->{lead};
  push @frag, ["pt", $_] for @{$s->{points}};
  for my $v (@{$s->{visuals}}) { push @frag, ['cap', $v->{caption}] if ref $v->{caption}; if ($v->{src}) { print "NO IMG $v->{src}\n" unless -f "$root/src/$d->{id}/$v->{src}" } }
  for my $f (@frag) { my ($n, $o) = @$f; next unless $o->{verbatim}; my $t = norm($o->{text});
    my $hay = $n eq 'title' ? norm(join ' ', map { $_->[1] } @heads) : $txt;
    if (index($hay, $t) < 0) { print "VERBATIM FAIL [$s->{key}] $n: $o->{text}\n"; $bad++ } }
}
# intent
{ my $t = norm($d->{intent}{text}); print "INTENT FAIL\n" if $d->{intent}{verbatim} && index(norm($md), $t) < 0 }
for my $p ($d->{cover}, map({ $_->{src} } @{$d->{screenshots}}), map({ $_->{image} ? $_->{image}{src} : () } @{$d->{highlights}})) { print "NO IMG $p\n" unless -f "$root/src/$d->{id}/$p" }
printf "slides %d chapters %d\n", scalar @{$d->{deck}{slides}}, scalar @{$d->{deck}{chapters}};
print $bad ? "BAD $bad\n" : "OK\n";
