shopt -s extglob
shopt -s nullglob
for FILE in {**,.}/!(index|404).html; do
  mkdir -p ${FILE%.*}
  git mv "$FILE" "${FILE%.*}/index.html"
done
